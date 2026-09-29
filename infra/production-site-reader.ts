import type { CloudFormationTemplate } from './dev-foundation';

const tags = () => [
  { Key: 'Project', Value: 'admintonibover' },
  { Key: 'Environment', Value: 'prod' },
  { Key: 'ManagedBy', Value: 'iac' },
  { Key: 'Owner', Value: 'orio' },
];

/** Separate stack: existing production admin/data resources are not managed here. */
export function createProductionSiteReaderTemplate(): CloudFormationTemplate {
  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description:
      'Read-only production content reader for the Toni Bover dev Preview.',
    Metadata: { Operations: 'docs/production-site-reader-rollout.md' },
    Parameters: {
      GuardrailsEvidenceConfirmed: {
        Type: 'String',
        AllowedValues: ['CONFIRMED'],
        Description:
          'Confirm the non-root caller, account, production resources, existing OIDC provider, trust, costs and rollback before this change set.',
      },
      ProductionContentTableName: {
        Type: 'String',
        MinLength: 3,
        MaxLength: 255,
        AllowedPattern: '^[A-Za-z0-9_.-]+$',
        Description: 'Exact TableName output from the production foundation.',
      },
      ProductionContentBucketName: {
        Type: 'String',
        MinLength: 3,
        MaxLength: 63,
        AllowedPattern: '^[a-z0-9][a-z0-9.-]+[a-z0-9]$',
        Description: 'Exact BucketName output from the production foundation.',
      },
      VercelTeamSlug: {
        Type: 'String',
        MinLength: 1,
        MaxLength: 100,
        AllowedPattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        Description:
          'Exact Team issuer slug of the existing managed OIDC provider in this account.',
      },
      VercelSiteProjectName: {
        Type: 'String',
        MinLength: 1,
        MaxLength: 100,
        AllowedPattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        Description: 'Exact Toni Bover Vercel project name.',
      },
      ReaderCodeObjectKey: {
        Type: 'String',
        AllowedPattern: '^deployment/build-reader/[0-9a-f]{64}\\.zip$',
        Description:
          'Content-addressed reader zip staged in the existing private production content bucket.',
      },
    },
    Rules: {
      GuardrailsMustBeConfirmed: {
        Assertions: [
          {
            Assert: {
              'Fn::Equals': [
                { Ref: 'GuardrailsEvidenceConfirmed' },
                'CONFIRMED',
              ],
            },
            AssertDescription: 'Review the private deployment baseline first.',
          },
        ],
      },
    },
    Conditions: {},
    Resources: {
      ReaderLogGroup: {
        Type: 'AWS::Logs::LogGroup',
        Properties: {
          LogGroupName: {
            'Fn::Sub': '/aws/lambda/${AWS::StackName}-build-reader',
          },
          LogGroupClass: 'STANDARD',
          RetentionInDays: 14,
          Tags: tags(),
        },
      },
      ReaderExecutionRole: {
        Type: 'AWS::IAM::Role',
        Properties: {
          Description: 'Published-only production reader execution role.',
          Path: '/admintonibover/',
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: { Service: 'lambda.amazonaws.com' },
                Action: 'sts:AssumeRole',
              },
            ],
          },
          Policies: [
            {
              PolicyName: 'published-production-reader-only',
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
                    Resource: { 'Fn::GetAtt': ['ReaderLogGroup', 'Arn'] },
                  },
                  {
                    Effect: 'Allow',
                    Action: ['dynamodb:GetItem', 'dynamodb:Query'],
                    Resource: {
                      'Fn::Sub':
                        'arn:${AWS::Partition}:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${ProductionContentTableName}',
                    },
                  },
                  {
                    Effect: 'Allow',
                    Action: ['s3:GetObject'],
                    Resource: {
                      'Fn::Sub':
                        'arn:${AWS::Partition}:s3:::${ProductionContentBucketName}/images/posts/*',
                    },
                  },
                ],
              },
            },
          ],
          Tags: tags(),
        },
      },
      ReaderFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: { 'Fn::Sub': '${AWS::StackName}-build-reader' },
          Description: 'IAM-invoked published-only production content reader.',
          PackageType: 'Zip',
          Runtime: 'nodejs24.x',
          Handler: 'index.handler',
          Architectures: ['arm64'],
          MemorySize: 256,
          Timeout: 30,
          ReservedConcurrentExecutions: 2,
          RecursiveLoop: 'Terminate',
          Role: { 'Fn::GetAtt': ['ReaderExecutionRole', 'Arn'] },
          Code: {
            S3Bucket: { Ref: 'ProductionContentBucketName' },
            S3Key: { Ref: 'ReaderCodeObjectKey' },
          },
          Environment: {
            Variables: {
              CONTENT_TABLE_NAME: { Ref: 'ProductionContentTableName' },
              CONTENT_BUCKET_NAME: { Ref: 'ProductionContentBucketName' },
              READER_ENVIRONMENT: 'prod',
            },
          },
          LoggingConfig: {
            ApplicationLogLevel: 'WARN',
            LogFormat: 'JSON',
            LogGroup: { Ref: 'ReaderLogGroup' },
            SystemLogLevel: 'WARN',
          },
          TracingConfig: { Mode: 'PassThrough' },
          Tags: tags(),
        },
      },
      ReaderPreviewInvokeRole: {
        Type: 'AWS::IAM::Role',
        Properties: {
          Description:
            'Invoke this production reader from the exact site project Preview identity.',
          Path: '/admintonibover/',
          AssumeRolePolicyDocument: {
            'Fn::Sub':
              '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Federated":"arn:${AWS::Partition}:iam::${AWS::AccountId}:oidc-provider/oidc.vercel.com/${VercelTeamSlug}"},"Action":"sts:AssumeRoleWithWebIdentity","Condition":{"StringEquals":{"oidc.vercel.com/${VercelTeamSlug}:aud":"https://vercel.com/${VercelTeamSlug}","oidc.vercel.com/${VercelTeamSlug}:sub":"owner:${VercelTeamSlug}:project:${VercelSiteProjectName}:environment:preview"}}}]}',
          },
          Policies: [
            {
              PolicyName: 'invoke-exact-production-reader',
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: ['lambda:InvokeFunction'],
                    Resource: { 'Fn::GetAtt': ['ReaderFunction', 'Arn'] },
                  },
                ],
              },
            },
          ],
          Tags: tags(),
        },
      },
    },
    Outputs: {
      ReaderEnvironment: { Value: 'prod' },
      ReaderRegion: { Value: { Ref: 'AWS::Region' } },
      ReaderFunctionArn: { Value: { 'Fn::GetAtt': ['ReaderFunction', 'Arn'] } },
      ReaderPreviewInvokeRoleArn: {
        Value: { 'Fn::GetAtt': ['ReaderPreviewInvokeRole', 'Arn'] },
      },
      ReusedVercelOidcProviderArn: {
        Value: {
          'Fn::Sub':
            'arn:${AWS::Partition}:iam::${AWS::AccountId}:oidc-provider/oidc.vercel.com/${VercelTeamSlug}',
        },
      },
    },
  };
}
