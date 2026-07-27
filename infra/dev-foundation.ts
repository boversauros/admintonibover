type CloudFormationResource = {
  Type: string;
  Properties?: Record<string, unknown>;
  DependsOn?: string | string[];
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
};

export type CloudFormationTemplate = {
  AWSTemplateFormatVersion: string;
  Description: string;
  Metadata: Record<string, unknown>;
  Parameters: Record<string, Record<string, unknown>>;
  Rules: Record<string, unknown>;
  Conditions: Record<string, unknown>;
  Resources: Record<string, CloudFormationResource>;
  Outputs: Record<string, Record<string, unknown>>;
};

export const EXPECTED_RESOURCE_TYPE_COUNTS = {
  'AWS::ApiGatewayV2::Api': 1,
  'AWS::ApiGatewayV2::Authorizer': 1,
  'AWS::ApiGatewayV2::Integration': 1,
  'AWS::ApiGatewayV2::Route': 1,
  'AWS::ApiGatewayV2::Stage': 1,
  'AWS::Cognito::UserPool': 1,
  'AWS::Cognito::UserPoolClient': 1,
  'AWS::Cognito::UserPoolDomain': 1,
  'AWS::Cognito::UserPoolResourceServer': 1,
  'AWS::DynamoDB::Table': 1,
  'AWS::IAM::Role': 1,
  'AWS::Lambda::Function': 1,
  'AWS::Lambda::Permission': 1,
  'AWS::Logs::LogGroup': 1,
  'AWS::S3::Bucket': 1,
  'AWS::S3::BucketPolicy': 1,
} as const;

export const REQUIRED_TAGS = {
  Project: 'admintonibover',
  Environment: { Ref: 'Environment' },
  ManagedBy: 'iac',
  Owner: 'orio',
} as const;

export const FOUNDATION_LAMBDA_CODE = String.raw`'use strict';

function claimContains(value, expected) {
  if (Array.isArray(value)) return value.includes(expected);
  return String(value ?? '').split(' ').includes(expected);
}

exports.handler = async event => {
  const requestId = event?.requestContext?.requestId ?? 'unknown';
  const claims = event?.requestContext?.authorizer?.jwt?.claims ?? {};
  const clientId = claims.client_id ?? claims.aud;
  const authorized =
    claims.iss === process.env.EXPECTED_ISSUER &&
    clientId === process.env.EXPECTED_CLIENT_ID &&
    claims.token_use === 'access' &&
    typeof claims.sub === 'string' &&
    claims.sub.length > 0 &&
    claimContains(claims.scope, process.env.REQUIRED_ADMIN_SCOPE);

  if (!authorized) {
    console.warn(
      JSON.stringify({
        level: 'WARN',
        message: 'authorization_claims_rejected',
        requestId,
      })
    );
    return {
      statusCode: 403,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: { code: 'FORBIDDEN', message: 'Access denied' },
        requestId,
      }),
    };
  }

  console.info(
    JSON.stringify({
      level: 'INFO',
      message: 'foundation_request_authorized',
      requestId,
    })
  );
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'ok', requestId }),
  };
};
`;

const tagList = () =>
  Object.entries(REQUIRED_TAGS).map(([Key, Value]) => ({ Key, Value }));

const tagMap = () => ({ ...REQUIRED_TAGS });

export function createDevFoundationTemplate(): CloudFormationTemplate {
  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description:
      'Cost-safe AWS development foundation for the admintonibover admin migration (issue #7).',
    Metadata: {
      Issue: 'https://github.com/boversauros/admintonibover/issues/7',
      ArchitectureDecision:
        'docs/adr/0001-admin-only-aws-data-security-contract.md',
      Runbook: 'docs/runbooks/aws-development-foundation.md',
      'AWS::CloudFormation::Interface': {
        ParameterGroups: [
          {
            Label: { default: 'Deployment safety' },
            Parameters: [
              'GuardrailsEvidenceConfirmed',
              'Environment',
              'EnableTableDeletionProtection',
            ],
          },
          {
            Label: { default: 'Exact development origins' },
            Parameters: ['AllowedOrigins', 'CallbackUrls', 'LogoutUrls'],
          },
          {
            Label: { default: 'Cognito managed-login domain' },
            Parameters: ['CognitoDomainPrefix'],
          },
        ],
        ParameterLabels: {
          GuardrailsEvidenceConfirmed: {
            default: 'Issue #3 evidence rechecked',
          },
          EnableTableDeletionProtection: {
            default: 'DynamoDB deletion protection',
          },
        },
      },
    },
    Parameters: {
      GuardrailsEvidenceConfirmed: {
        Type: 'String',
        AllowedValues: ['CONFIRMED'],
        Description:
          'Required acknowledgement that the private issue #3 account, identity, billing, Region, and resource-baseline evidence was rechecked immediately before this change set.',
      },
      Environment: {
        Type: 'String',
        Default: 'dev',
        AllowedValues: ['dev'],
        Description:
          'Issue #7 intentionally permits only the isolated development environment.',
      },
      AllowedOrigins: {
        Type: 'CommaDelimitedList',
        Description:
          'Exact local and HTTPS development admin origins for API Gateway and S3 CORS. Do not use wildcards.',
      },
      CallbackUrls: {
        Type: 'CommaDelimitedList',
        Description:
          'Exact Cognito authorization-code callback URLs. HTTPS is required except for localhost.',
      },
      LogoutUrls: {
        Type: 'CommaDelimitedList',
        Description: 'Exact Cognito logout redirect URLs.',
      },
      CognitoDomainPrefix: {
        Type: 'String',
        MinLength: 3,
        MaxLength: 63,
        AllowedPattern: '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$',
        ConstraintDescription:
          'Use a globally unique 3-63 character lowercase prefix containing only letters, numbers, and internal hyphens.',
        Description:
          'Globally unique prefix for the development Cognito managed-login domain.',
      },
      EnableTableDeletionProtection: {
        Type: 'String',
        Default: 'false',
        AllowedValues: ['true', 'false'],
        Description:
          'Keep false for the first deployment; update to true immediately after verification. Disable only for the documented dev deletion rehearsal.',
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
            AssertDescription:
              'Recheck the private account, identity, billing, Region, and resource-baseline evidence from issue #3 before deploying.',
          },
        ],
      },
    },
    Conditions: {
      TableDeletionProtectionEnabled: {
        'Fn::Equals': [{ Ref: 'EnableTableDeletionProtection' }, 'true'],
      },
    },
    Resources: {
      ContentTable: {
        Type: 'AWS::DynamoDB::Table',
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
        Properties: {
          AttributeDefinitions: [
            { AttributeName: 'PK', AttributeType: 'S' },
            { AttributeName: 'SK', AttributeType: 'S' },
          ],
          KeySchema: [
            { AttributeName: 'PK', KeyType: 'HASH' },
            { AttributeName: 'SK', KeyType: 'RANGE' },
          ],
          BillingMode: 'PAY_PER_REQUEST',
          TableClass: 'STANDARD',
          DeletionProtectionEnabled: {
            'Fn::If': ['TableDeletionProtectionEnabled', true, false],
          },
          PointInTimeRecoverySpecification: {
            PointInTimeRecoveryEnabled: false,
          },
          TimeToLiveSpecification: {
            AttributeName: 'expiresAt',
            Enabled: true,
          },
          Tags: tagList(),
        },
      },
      ContentBucket: {
        Type: 'AWS::S3::Bucket',
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
        Properties: {
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              {
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'AES256',
                },
              },
            ],
          },
          OwnershipControls: {
            Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }],
          },
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
          CorsConfiguration: {
            CorsRules: [
              {
                AllowedOrigins: { Ref: 'AllowedOrigins' },
                AllowedMethods: ['GET', 'HEAD', 'PUT'],
                AllowedHeaders: ['content-type', 'x-amz-checksum-sha256'],
                ExposedHeaders: ['etag', 'x-amz-checksum-sha256'],
                MaxAge: 300,
              },
            ],
          },
          LifecycleConfiguration: {
            Rules: [
              {
                Id: 'ExpireAbandonedTemporaryUploads',
                Prefix: 'temporary/',
                Status: 'Enabled',
                ExpirationInDays: 1,
                AbortIncompleteMultipartUpload: {
                  DaysAfterInitiation: 1,
                },
              },
            ],
          },
          Tags: tagList(),
        },
      },
      ContentBucketPolicy: {
        Type: 'AWS::S3::BucketPolicy',
        Properties: {
          Bucket: { Ref: 'ContentBucket' },
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Sid: 'DenyInsecureTransport',
                Effect: 'Deny',
                Principal: '*',
                Action: 's3:*',
                Resource: [
                  { 'Fn::GetAtt': ['ContentBucket', 'Arn'] },
                  {
                    'Fn::Sub': '${ContentBucket.Arn}/*',
                  },
                ],
                Condition: {
                  Bool: { 'aws:SecureTransport': 'false' },
                },
              },
            ],
          },
        },
      },
      UserPool: {
        Type: 'AWS::Cognito::UserPool',
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
        Properties: {
          UserPoolName: {
            'Fn::Sub': '${AWS::StackName}-admins',
          },
          UserPoolTier: 'LITE',
          DeletionProtection: 'INACTIVE',
          AdminCreateUserConfig: {
            AllowAdminCreateUserOnly: true,
            UnusedAccountValidityDays: 3,
          },
          UsernameAttributes: ['email'],
          UsernameConfiguration: { CaseSensitive: false },
          AutoVerifiedAttributes: ['email'],
          AccountRecoverySetting: {
            RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }],
          },
          MfaConfiguration: 'ON',
          EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
          Policies: {
            PasswordPolicy: {
              MinimumLength: 14,
              RequireLowercase: true,
              RequireUppercase: true,
              RequireNumbers: true,
              RequireSymbols: true,
              TemporaryPasswordValidityDays: 3,
            },
          },
          Schema: [
            {
              Name: 'email',
              AttributeDataType: 'String',
              Mutable: true,
              Required: true,
            },
          ],
          EmailConfiguration: {
            EmailSendingAccount: 'COGNITO_DEFAULT',
          },
          VerificationMessageTemplate: {
            DefaultEmailOption: 'CONFIRM_WITH_CODE',
          },
          UserPoolTags: tagMap(),
        },
      },
      AdminResourceServer: {
        Type: 'AWS::Cognito::UserPoolResourceServer',
        Properties: {
          Identifier: 'admintonibover-api',
          Name: 'admintonibover admin API',
          Scopes: [
            {
              ScopeName: 'admin',
              ScopeDescription:
                'Access to the authenticated admintonibover admin API',
            },
          ],
          UserPoolId: { Ref: 'UserPool' },
        },
      },
      UserPoolClient: {
        Type: 'AWS::Cognito::UserPoolClient',
        DependsOn: 'AdminResourceServer',
        Properties: {
          UserPoolId: { Ref: 'UserPool' },
          ClientName: {
            'Fn::Sub': '${AWS::StackName}-public-client',
          },
          GenerateSecret: false,
          SupportedIdentityProviders: ['COGNITO'],
          AllowedOAuthFlowsUserPoolClient: true,
          AllowedOAuthFlows: ['code'],
          AllowedOAuthScopes: [
            'openid',
            'email',
            'profile',
            'admintonibover-api/admin',
          ],
          CallbackURLs: { Ref: 'CallbackUrls' },
          LogoutURLs: { Ref: 'LogoutUrls' },
          ExplicitAuthFlows: ['ALLOW_REFRESH_TOKEN_AUTH'],
          PreventUserExistenceErrors: 'ENABLED',
          EnableTokenRevocation: true,
          AuthSessionValidity: 5,
          AccessTokenValidity: 15,
          IdTokenValidity: 15,
          RefreshTokenValidity: 1,
          TokenValidityUnits: {
            AccessToken: 'minutes',
            IdToken: 'minutes',
            RefreshToken: 'days',
          },
        },
      },
      UserPoolDomain: {
        Type: 'AWS::Cognito::UserPoolDomain',
        Properties: {
          Domain: { Ref: 'CognitoDomainPrefix' },
          UserPoolId: { Ref: 'UserPool' },
        },
      },
      LambdaLogGroup: {
        Type: 'AWS::Logs::LogGroup',
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
        Properties: {
          LogGroupName: {
            'Fn::Sub': '/aws/lambda/${AWS::StackName}-foundation',
          },
          LogGroupClass: 'STANDARD',
          RetentionInDays: 14,
          Tags: tagList(),
        },
      },
      LambdaExecutionRole: {
        Type: 'AWS::IAM::Role',
        Properties: {
          Description:
            'Least-privilege execution role for the issue #7 foundation Lambda.',
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
              PolicyName: 'foundation-runtime-access',
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                  {
                    Sid: 'WriteOnlyOwnLogGroup',
                    Effect: 'Allow',
                    Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
                    Resource: {
                      'Fn::GetAtt': ['LambdaLogGroup', 'Arn'],
                    },
                  },
                  {
                    Sid: 'UseExactContentTable',
                    Effect: 'Allow',
                    Action: [
                      'dynamodb:BatchGetItem',
                      'dynamodb:DeleteItem',
                      'dynamodb:DescribeTable',
                      'dynamodb:GetItem',
                      'dynamodb:PutItem',
                      'dynamodb:Query',
                      'dynamodb:UpdateItem',
                    ],
                    Resource: {
                      'Fn::GetAtt': ['ContentTable', 'Arn'],
                    },
                  },
                  {
                    Sid: 'ListApprovedBucketPrefixes',
                    Effect: 'Allow',
                    Action: ['s3:ListBucket'],
                    Resource: {
                      'Fn::GetAtt': ['ContentBucket', 'Arn'],
                    },
                    Condition: {
                      StringLike: {
                        's3:prefix': ['temporary/*', 'images/*', 'backups/*'],
                      },
                    },
                  },
                  {
                    Sid: 'UseApprovedBucketPrefixes',
                    Effect: 'Allow',
                    Action: ['s3:DeleteObject', 's3:GetObject', 's3:PutObject'],
                    Resource: [
                      {
                        'Fn::Sub': '${ContentBucket.Arn}/temporary/*',
                      },
                      {
                        'Fn::Sub': '${ContentBucket.Arn}/images/*',
                      },
                      {
                        'Fn::Sub': '${ContentBucket.Arn}/backups/*',
                      },
                    ],
                  },
                ],
              },
            },
          ],
          Tags: tagList(),
        },
      },
      FoundationFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: {
            'Fn::Sub': '${AWS::StackName}-foundation',
          },
          Description:
            'Protected health endpoint and foundation for subsequent admin API issues.',
          PackageType: 'Zip',
          Runtime: 'nodejs24.x',
          Handler: 'index.handler',
          Architectures: ['arm64'],
          MemorySize: 128,
          Timeout: 5,
          ReservedConcurrentExecutions: 2,
          RecursiveLoop: 'Terminate',
          Role: {
            'Fn::GetAtt': ['LambdaExecutionRole', 'Arn'],
          },
          Code: {
            ZipFile: FOUNDATION_LAMBDA_CODE,
          },
          Environment: {
            Variables: {
              CONTENT_TABLE_NAME: { Ref: 'ContentTable' },
              CONTENT_BUCKET_NAME: { Ref: 'ContentBucket' },
              EXPECTED_ISSUER: {
                'Fn::Sub':
                  'https://cognito-idp.${AWS::Region}.${AWS::URLSuffix}/${UserPool}',
              },
              EXPECTED_CLIENT_ID: { Ref: 'UserPoolClient' },
              REQUIRED_ADMIN_SCOPE: 'admintonibover-api/admin',
            },
          },
          LoggingConfig: {
            ApplicationLogLevel: 'INFO',
            LogFormat: 'JSON',
            LogGroup: { Ref: 'LambdaLogGroup' },
            SystemLogLevel: 'WARN',
          },
          TracingConfig: { Mode: 'PassThrough' },
          Tags: tagList(),
        },
      },
      HttpApi: {
        Type: 'AWS::ApiGatewayV2::Api',
        Properties: {
          Name: { 'Fn::Sub': '${AWS::StackName}-http-api' },
          Description:
            'Authenticated HTTP API for the admintonibover development admin.',
          ProtocolType: 'HTTP',
          CorsConfiguration: {
            AllowCredentials: true,
            AllowOrigins: { Ref: 'AllowedOrigins' },
            AllowMethods: ['GET', 'OPTIONS'],
            AllowHeaders: [
              'authorization',
              'content-type',
              'idempotency-key',
              'if-match',
              'x-correlation-id',
            ],
            ExposeHeaders: ['etag', 'x-correlation-id'],
            MaxAge: 300,
          },
          Tags: tagMap(),
        },
      },
      JwtAuthorizer: {
        Type: 'AWS::ApiGatewayV2::Authorizer',
        Properties: {
          ApiId: { Ref: 'HttpApi' },
          AuthorizerType: 'JWT',
          IdentitySource: ['$request.header.Authorization'],
          JwtConfiguration: {
            Audience: [{ Ref: 'UserPoolClient' }],
            Issuer: {
              'Fn::Sub':
                'https://cognito-idp.${AWS::Region}.${AWS::URLSuffix}/${UserPool}',
            },
          },
          Name: 'cognito-admin-jwt',
        },
      },
      FoundationIntegration: {
        Type: 'AWS::ApiGatewayV2::Integration',
        Properties: {
          ApiId: { Ref: 'HttpApi' },
          Description:
            'Lambda proxy integration for the protected foundation endpoint.',
          IntegrationType: 'AWS_PROXY',
          IntegrationMethod: 'POST',
          IntegrationUri: {
            'Fn::GetAtt': ['FoundationFunction', 'Arn'],
          },
          PayloadFormatVersion: '2.0',
          TimeoutInMillis: 5000,
        },
      },
      FoundationRoute: {
        Type: 'AWS::ApiGatewayV2::Route',
        DependsOn: 'AdminResourceServer',
        Properties: {
          ApiId: { Ref: 'HttpApi' },
          AuthorizationScopes: ['admintonibover-api/admin'],
          AuthorizationType: 'JWT',
          AuthorizerId: { Ref: 'JwtAuthorizer' },
          RouteKey: 'GET /health',
          Target: {
            'Fn::Join': [
              '/',
              ['integrations', { Ref: 'FoundationIntegration' }],
            ],
          },
        },
      },
      ApiStage: {
        Type: 'AWS::ApiGatewayV2::Stage',
        Properties: {
          ApiId: { Ref: 'HttpApi' },
          StageName: '$default',
          AutoDeploy: true,
          DefaultRouteSettings: {
            DetailedMetricsEnabled: false,
            ThrottlingBurstLimit: 4,
            ThrottlingRateLimit: 2,
          },
          Tags: tagMap(),
        },
      },
      ApiInvokePermission: {
        Type: 'AWS::Lambda::Permission',
        Properties: {
          Action: 'lambda:InvokeFunction',
          FunctionName: { Ref: 'FoundationFunction' },
          Principal: 'apigateway.amazonaws.com',
          SourceArn: {
            'Fn::Sub':
              'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${HttpApi}/*/GET/health',
          },
        },
      },
    },
    Outputs: {
      Region: {
        Description: 'AWS Region containing the development stack.',
        Value: { Ref: 'AWS::Region' },
      },
      Environment: {
        Description: 'Isolated stack environment.',
        Value: { Ref: 'Environment' },
      },
      ApiUrl: {
        Description: 'Base URL of the protected HTTP API.',
        Value: { 'Fn::GetAtt': ['HttpApi', 'ApiEndpoint'] },
      },
      UserPoolId: {
        Description: 'Public Cognito User Pool identifier.',
        Value: { Ref: 'UserPool' },
      },
      UserPoolClientId: {
        Description:
          'Public Cognito app-client identifier; the client has no secret.',
        Value: { Ref: 'UserPoolClient' },
      },
      CognitoLoginUrl: {
        Description: 'Base URL of the Cognito managed-login domain.',
        Value: {
          'Fn::Sub':
            'https://${CognitoDomainPrefix}.auth.${AWS::Region}.amazoncognito.com',
        },
      },
      TableName: {
        Description: 'DynamoDB content table name.',
        Value: { Ref: 'ContentTable' },
      },
      BucketName: {
        Description: 'Private S3 content bucket name.',
        Value: { Ref: 'ContentBucket' },
      },
      LambdaFunctionName: {
        Description: 'Foundation Lambda function name.',
        Value: { Ref: 'FoundationFunction' },
      },
    },
  };
}
