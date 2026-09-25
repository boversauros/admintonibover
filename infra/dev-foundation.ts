import { readFileSync } from 'node:fs';

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

export const FOUNDATION_ENVIRONMENTS = ['dev', 'prod'] as const;

export type FoundationEnvironment = (typeof FOUNDATION_ENVIRONMENTS)[number];

export const EXPECTED_RESOURCE_TYPE_COUNTS = {
  'AWS::ApiGatewayV2::Api': 1,
  'AWS::ApiGatewayV2::Authorizer': 1,
  'AWS::ApiGatewayV2::Integration': 1,
  'AWS::ApiGatewayV2::Route': 24,
  'AWS::ApiGatewayV2::Stage': 1,
  'AWS::Cognito::UserPool': 1,
  'AWS::Cognito::UserPoolClient': 1,
  'AWS::Cognito::UserPoolDomain': 1,
  'AWS::Cognito::UserPoolGroup': 2,
  'AWS::Cognito::UserPoolResourceServer': 1,
  'AWS::Cognito::UserPoolUserToGroupAttachment': 1,
  'AWS::DynamoDB::Table': 1,
  'AWS::IAM::Role': 1,
  'AWS::Lambda::Function': 1,
  'AWS::Lambda::Permission': 1,
  'AWS::Logs::LogGroup': 1,
  'AWS::S3::Bucket': 1,
  'AWS::S3::BucketPolicy': 1,
} as const;

export const EXPECTED_DEV_RESOURCE_TYPE_COUNTS = {
  ...EXPECTED_RESOURCE_TYPE_COUNTS,
  'AWS::IAM::OIDCProvider': 1,
  'AWS::IAM::Role': 3,
  'AWS::Lambda::Function': 2,
  'AWS::Logs::LogGroup': 2,
} as const;

export const REQUIRED_TAGS = {
  Project: 'admintonibover',
  Environment: { Ref: 'Environment' },
  ManagedBy: 'iac',
  Owner: 'orio',
} as const;

const HTTPS_ADMIN_ORIGIN =
  'https://[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::[1-9][0-9]{0,4})?';
const LOCAL_ADMIN_ORIGIN =
  'http://(?:localhost|127\\.0\\.0\\.1)(?::[1-9][0-9]{0,4})?';
const DNS_LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const DNS_TOP_LEVEL_LABEL = '[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const HTTPS_PRODUCTION_ADMIN_ORIGIN = `https://${DNS_LABEL}(?:\\.${DNS_LABEL})*\\.${DNS_TOP_LEVEL_LABEL}`;
export const EXACT_ADMIN_ORIGIN_PATTERN = `^(?:${HTTPS_ADMIN_ORIGIN}|${LOCAL_ADMIN_ORIGIN})$`;
export const EXACT_CALLBACK_URL_PATTERN = `^(?:${HTTPS_ADMIN_ORIGIN}|${LOCAL_ADMIN_ORIGIN})/auth/callback$`;
export const EXACT_LOGOUT_URL_PATTERN = `^(?:${HTTPS_ADMIN_ORIGIN}|${LOCAL_ADMIN_ORIGIN})/$`;
export const EXACT_PRODUCTION_ADMIN_ORIGIN_PATTERN = `^${HTTPS_PRODUCTION_ADMIN_ORIGIN}$`;
export const EXACT_PRODUCTION_CALLBACK_URL_PATTERN = `^${HTTPS_PRODUCTION_ADMIN_ORIGIN}/auth/callback$`;
export const EXACT_PRODUCTION_LOGOUT_URL_PATTERN = `^${HTTPS_PRODUCTION_ADMIN_ORIGIN}/$`;

export const FOUNDATION_LAMBDA_CODE = readFileSync(
  new URL('./generated/foundation-lambda.cjs', import.meta.url),
  'utf8'
);

const tagList = () =>
  Object.entries(REQUIRED_TAGS).map(([Key, Value]) => ({ Key, Value }));

const tagMap = () => ({ ...REQUIRED_TAGS });

const protectedRoute = (routeKey: string): CloudFormationResource => ({
  Type: 'AWS::ApiGatewayV2::Route',
  DependsOn: 'InitialSuperAdminMembership',
  Properties: {
    ApiId: { Ref: 'HttpApi' },
    AuthorizationType: 'JWT',
    AuthorizerId: { Ref: 'JwtAuthorizer' },
    RouteKey: routeKey,
    Target: {
      'Fn::Join': ['/', ['integrations', { Ref: 'FoundationIntegration' }]],
    },
  },
});

export function createFoundationTemplate(
  environment: FoundationEnvironment
): CloudFormationTemplate {
  const isProduction = environment === 'prod';
  const environmentLabel = isProduction ? 'production' : 'development';
  const protectedResourceDeletionPolicy = isProduction ? 'Retain' : 'Delete';
  const bucketDeletionPolicy = isProduction ? 'RetainExceptOnCreate' : 'Delete';
  const dataUpdateReplacePolicy = isProduction ? 'Retain' : 'Delete';
  const originPattern = isProduction
    ? EXACT_PRODUCTION_ADMIN_ORIGIN_PATTERN
    : EXACT_ADMIN_ORIGIN_PATTERN;
  const callbackPattern = isProduction
    ? EXACT_PRODUCTION_CALLBACK_URL_PATTERN
    : EXACT_CALLBACK_URL_PATTERN;
  const logoutPattern = isProduction
    ? EXACT_PRODUCTION_LOGOUT_URL_PATTERN
    : EXACT_LOGOUT_URL_PATTERN;

  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: `Cost-safe AWS ${environmentLabel} foundation and authenticated admin API for admintonibover.`,
    Metadata: {
      Architecture: 'docs/architecture.md',
      Operations: 'docs/operations.md',
      'AWS::CloudFormation::Interface': {
        ParameterGroups: [
          {
            Label: { default: 'Deployment safety' },
            Parameters: isProduction
              ? ['GuardrailsEvidenceConfirmed', 'Environment']
              : [
                  'GuardrailsEvidenceConfirmed',
                  'Environment',
                  'EnableTableDeletionProtection',
                ],
          },
          {
            Label: { default: `Exact ${environmentLabel} origins` },
            Parameters: ['AllowedOrigins', 'CallbackUrls', 'LogoutUrls'],
          },
          {
            Label: { default: 'Cognito access' },
            Parameters: ['CognitoDomainPrefix', 'ExistingSuperAdminUsername'],
          },
        ],
        ParameterLabels: {
          GuardrailsEvidenceConfirmed: {
            default: 'Account guardrails rechecked',
          },
          ExistingSuperAdminUsername: {
            default: 'Existing super-admin Cognito username',
          },
          ...(isProduction
            ? {}
            : {
                EnableTableDeletionProtection: {
                  default: 'DynamoDB deletion protection',
                },
                VercelTeamSlug: { default: 'Exact Vercel team slug' },
                VercelSiteProjectName: {
                  default: 'Exact Vercel site project name',
                },
                ReaderCodeObjectKey: {
                  default: 'Content-addressed reader Lambda zip key',
                },
              }),
        },
      },
    },
    Parameters: {
      GuardrailsEvidenceConfirmed: {
        Type: 'String',
        AllowedValues: ['CONFIRMED'],
        Description:
          'Required acknowledgement that the private account, identity, billing, Region, and resource baseline were rechecked immediately before this change set.',
      },
      Environment: {
        Type: 'String',
        Default: environment,
        AllowedValues: [environment],
        Description: `This artifact permits only the isolated ${environmentLabel} environment.`,
      },
      AllowedOrigins: {
        Type: 'CommaDelimitedList',
        AllowedPattern: originPattern,
        ConstraintDescription: isProduction
          ? 'Each production origin must be one exact HTTPS origin, without paths or wildcards.'
          : 'Each origin must be one exact HTTPS origin or an HTTP localhost development origin, without paths or wildcards.',
        Description: `Exact ${environmentLabel} admin origins for API Gateway and S3 CORS. Do not use wildcards.`,
      },
      CallbackUrls: {
        Type: 'CommaDelimitedList',
        AllowedPattern: callbackPattern,
        ConstraintDescription: isProduction
          ? 'Each production callback must be an exact HTTPS URL ending in /auth/callback, without wildcards.'
          : 'Each callback must be an exact HTTPS or localhost URL ending in /auth/callback, without wildcards.',
        Description: `Exact ${environmentLabel} Cognito authorization-code callback URLs.`,
      },
      LogoutUrls: {
        Type: 'CommaDelimitedList',
        AllowedPattern: logoutPattern,
        ConstraintDescription: isProduction
          ? 'Each production logout URL must be an exact HTTPS origin with a trailing slash, without wildcards.'
          : 'Each logout URL must be an exact HTTPS or localhost origin with a trailing slash, without wildcards.',
        Description: `Exact ${environmentLabel} Cognito logout redirect URLs.`,
      },
      CognitoDomainPrefix: {
        Type: 'String',
        MinLength: 3,
        MaxLength: 63,
        AllowedPattern: '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$',
        ConstraintDescription:
          'Use a globally unique 3-63 character lowercase prefix containing only letters, numbers, and internal hyphens.',
        Description: `Globally unique prefix for the ${environmentLabel} Cognito managed-login domain.`,
      },
      ExistingSuperAdminUsername: {
        Type: 'String',
        NoEcho: true,
        MinLength: 1,
        MaxLength: 128,
        AllowedPattern: '^\\S+$',
        ConstraintDescription:
          'Use the exact private Username returned by Cognito list-users.',
        Description:
          'Existing confirmed administrator to attach to super-admins before group enforcement is updated.',
      },
      ...(isProduction
        ? {}
        : {
            EnableTableDeletionProtection: {
              Type: 'String',
              Default: 'false',
              AllowedValues: ['true', 'false'],
              Description:
                'Keep false for the first deployment; update to true immediately after verification. Disable only for the documented dev deletion rehearsal.',
            },
            VercelTeamSlug: {
              Type: 'String',
              MinLength: 1,
              MaxLength: 100,
              AllowedPattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
              Description:
                'Exact verified Vercel Team OIDC issuer slug; no wildcard.',
            },
            VercelSiteProjectName: {
              Type: 'String',
              MinLength: 1,
              MaxLength: 100,
              AllowedPattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
              Description:
                'Exact verified Vercel Preview site project name; no wildcard.',
            },
            ReaderCodeObjectKey: {
              Type: 'String',
              AllowedPattern: '^deployment/build-reader/[0-9a-f]{64}\\.zip$',
              Description:
                'Content-addressed reader zip uploaded to the private development content bucket.',
            },
          }),
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
              'Recheck the private account, identity, billing, Region, and resource baseline before deploying.',
          },
        ],
      },
    },
    Conditions: isProduction
      ? {}
      : {
          TableDeletionProtectionEnabled: {
            'Fn::Equals': [{ Ref: 'EnableTableDeletionProtection' }, 'true'],
          },
        },
    Resources: {
      ContentTable: {
        Type: 'AWS::DynamoDB::Table',
        DeletionPolicy: protectedResourceDeletionPolicy,
        UpdateReplacePolicy: dataUpdateReplacePolicy,
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
          DeletionProtectionEnabled: isProduction
            ? true
            : {
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
        DeletionPolicy: bucketDeletionPolicy,
        UpdateReplacePolicy: dataUpdateReplacePolicy,
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
              {
                Sid: 'DenyStalePresignedObjectRequests',
                Effect: 'Deny',
                Principal: '*',
                Action: ['s3:GetObject', 's3:PutObject'],
                Resource: {
                  'Fn::Sub': '${ContentBucket.Arn}/*',
                },
                Condition: {
                  NumericGreaterThan: {
                    's3:signatureAge': '300000',
                  },
                },
              },
            ],
          },
        },
      },
      UserPool: {
        Type: 'AWS::Cognito::UserPool',
        DeletionPolicy: protectedResourceDeletionPolicy,
        UpdateReplacePolicy: dataUpdateReplacePolicy,
        Properties: {
          UserPoolName: {
            'Fn::Sub': '${AWS::StackName}-admins',
          },
          UserPoolTier: 'LITE',
          DeletionProtection: isProduction ? 'ACTIVE' : 'INACTIVE',
          AdminCreateUserConfig: {
            AllowAdminCreateUserOnly: true,
          },
          UsernameAttributes: ['email'],
          UsernameConfiguration: { CaseSensitive: false },
          AutoVerifiedAttributes: ['email'],
          AccountRecoverySetting: {
            RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }],
          },
          MfaConfiguration: 'OFF',
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
      SuperAdminsGroup: {
        Type: 'AWS::Cognito::UserPoolGroup',
        DeletionPolicy: protectedResourceDeletionPolicy,
        UpdateReplacePolicy: dataUpdateReplacePolicy,
        Properties: {
          Description:
            'Full content access and eligibility for user management.',
          GroupName: 'super-admins',
          Precedence: 0,
          UserPoolId: { Ref: 'UserPool' },
        },
      },
      EditorsGroup: {
        Type: 'AWS::Cognito::UserPoolGroup',
        DeletionPolicy: protectedResourceDeletionPolicy,
        UpdateReplacePolicy: dataUpdateReplacePolicy,
        Properties: {
          Description: 'Content operations without user-management access.',
          GroupName: 'editors',
          Precedence: 10,
          UserPoolId: { Ref: 'UserPool' },
        },
      },
      InitialSuperAdminMembership: {
        Type: 'AWS::Cognito::UserPoolUserToGroupAttachment',
        DependsOn: 'SuperAdminsGroup',
        DeletionPolicy: protectedResourceDeletionPolicy,
        UpdateReplacePolicy: 'Delete',
        Properties: {
          GroupName: 'super-admins',
          Username: { Ref: 'ExistingSuperAdminUsername' },
          UserPoolId: { Ref: 'UserPool' },
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
            'aws.cognito.signin.user.admin',
            'admintonibover-api/admin',
          ],
          CallbackURLs: { Ref: 'CallbackUrls' },
          LogoutURLs: { Ref: 'LogoutUrls' },
          ExplicitAuthFlows: [
            'ALLOW_USER_PASSWORD_AUTH',
            'ALLOW_REFRESH_TOKEN_AUTH',
          ],
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
          Description: `Least-privilege execution role for the ${environmentLabel} foundation Lambda.`,
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
                      'dynamodb:Scan',
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
                  {
                    Sid: 'ManageUsersInExactPool',
                    Effect: 'Allow',
                    Action: [
                      'cognito-idp:ListUsers',
                      'cognito-idp:AdminListGroupsForUser',
                      'cognito-idp:AdminGetUser',
                      'cognito-idp:AdminCreateUser',
                      'cognito-idp:AdminAddUserToGroup',
                      'cognito-idp:AdminResetUserPassword',
                      'cognito-idp:AdminEnableUser',
                      'cognito-idp:AdminDisableUser',
                      'cognito-idp:AdminUserGlobalSignOut',
                    ],
                    Resource: { 'Fn::GetAtt': ['UserPool', 'Arn'] },
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
        DependsOn: 'InitialSuperAdminMembership',
        Properties: {
          FunctionName: {
            'Fn::Sub': '${AWS::StackName}-foundation',
          },
          Description: `Authenticated post, taxonomy, backup, and private media operations for the ${environmentLabel} admin.`,
          PackageType: 'Zip',
          Runtime: 'nodejs24.x',
          Handler: 'index.handler',
          Architectures: ['arm64'],
          MemorySize: 256,
          Timeout: 30,
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
              BACKUP_ENVIRONMENT: { Ref: 'Environment' },
              EXPECTED_ISSUER: {
                'Fn::Sub':
                  'https://cognito-idp.${AWS::Region}.${AWS::URLSuffix}/${UserPool}',
              },
              EXPECTED_CLIENT_ID: { Ref: 'UserPoolClient' },
              USER_POOL_ID: { Ref: 'UserPool' },
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
          Description: `Authenticated HTTP API for the admintonibover ${environmentLabel} admin.`,
          ProtocolType: 'HTTP',
          CorsConfiguration: {
            AllowCredentials: false,
            AllowOrigins: { Ref: 'AllowedOrigins' },
            AllowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
          Description: `Lambda proxy integration for protected ${environmentLabel} admin operations.`,
          IntegrationType: 'AWS_PROXY',
          IntegrationMethod: 'POST',
          IntegrationUri: {
            'Fn::GetAtt': ['FoundationFunction', 'Arn'],
          },
          PayloadFormatVersion: '2.0',
          TimeoutInMillis: 30000,
        },
      },
      FoundationRoute: protectedRoute('GET /health'),
      PostsListRoute: protectedRoute('GET /posts'),
      PostCreateRoute: protectedRoute('POST /posts'),
      PostsBulkPublicationRoute: protectedRoute('POST /posts/publication/bulk'),
      PostReadRoute: protectedRoute('GET /posts/{id}'),
      PostUpdateRoute: protectedRoute('PUT /posts/{id}'),
      PostDeleteRoute: protectedRoute('DELETE /posts/{id}'),
      PostPublicationRoute: protectedRoute('PUT /posts/{id}/publication'),
      PostImagesReadRoute: protectedRoute('GET /posts/{id}/images'),
      PostImagePresignRoute: protectedRoute('POST /posts/{id}/images/presign'),
      PostImageConfirmRoute: protectedRoute('POST /posts/{id}/images/confirm'),
      PostImageDetachRoute: protectedRoute('DELETE /posts/{id}/images/{role}'),
      CategoriesListRoute: protectedRoute('GET /categories'),
      CategoryCreateRoute: protectedRoute('POST /categories'),
      CategoryUpdateRoute: protectedRoute('PUT /categories/{id}'),
      CategoryDeleteRoute: protectedRoute('DELETE /categories/{id}'),
      KeywordsListRoute: protectedRoute('GET /keywords'),
      KeywordCreateRoute: protectedRoute('POST /keywords'),
      KeywordUpdateRoute: protectedRoute('PUT /keywords/{id}'),
      KeywordDeleteRoute: protectedRoute('DELETE /keywords/{id}'),
      BackupDownloadRoute: protectedRoute('GET /backup'),
      UsersListRoute: protectedRoute('GET /users'),
      UserInviteRoute: protectedRoute('POST /users'),
      UserActionRoute: protectedRoute('POST /users/{username}/actions'),
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
              'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${HttpApi}/*/*',
          },
        },
      },
      ...(isProduction
        ? {}
        : {
            ReaderLogGroup: {
              Type: 'AWS::Logs::LogGroup',
              DeletionPolicy: 'Delete',
              UpdateReplacePolicy: 'Delete',
              Properties: {
                LogGroupName: {
                  'Fn::Sub': '/aws/lambda/${AWS::StackName}-build-reader',
                },
                LogGroupClass: 'STANDARD',
                RetentionInDays: 14,
                Tags: tagList(),
              },
            },
            ReaderExecutionRole: {
              Type: 'AWS::IAM::Role',
              Properties: {
                Description:
                  'Read-only execution role for the development published-content build reader.',
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
                    PolicyName: 'published-reader-only',
                    PolicyDocument: {
                      Version: '2012-10-17',
                      Statement: [
                        {
                          Sid: 'WriteReaderLogs',
                          Effect: 'Allow',
                          Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
                          Resource: { 'Fn::GetAtt': ['ReaderLogGroup', 'Arn'] },
                        },
                        {
                          Sid: 'ReadExactTable',
                          Effect: 'Allow',
                          Action: ['dynamodb:GetItem', 'dynamodb:Query'],
                          Resource: { 'Fn::GetAtt': ['ContentTable', 'Arn'] },
                        },
                        {
                          Sid: 'ReadPostImagesOnly',
                          Effect: 'Allow',
                          Action: ['s3:GetObject'],
                          Resource: {
                            'Fn::Sub': '${ContentBucket.Arn}/images/posts/*',
                          },
                        },
                      ],
                    },
                  },
                ],
                Tags: tagList(),
              },
            },
            ReaderFunction: {
              Type: 'AWS::Lambda::Function',
              Properties: {
                FunctionName: { 'Fn::Sub': '${AWS::StackName}-build-reader' },
                Description:
                  'IAM-invoked published-only development content reader.',
                PackageType: 'Zip',
                Runtime: 'nodejs24.x',
                Handler: 'index.handler',
                Architectures: ['arm64'],
                MemorySize: 256,
                Timeout: 30,
                RecursiveLoop: 'Terminate',
                Role: { 'Fn::GetAtt': ['ReaderExecutionRole', 'Arn'] },
                Code: {
                  S3Bucket: { Ref: 'ContentBucket' },
                  S3Key: { Ref: 'ReaderCodeObjectKey' },
                },
                Environment: {
                  Variables: {
                    CONTENT_TABLE_NAME: { Ref: 'ContentTable' },
                    CONTENT_BUCKET_NAME: { Ref: 'ContentBucket' },
                    READER_ENVIRONMENT: 'dev',
                  },
                },
                LoggingConfig: {
                  ApplicationLogLevel: 'WARN',
                  LogFormat: 'JSON',
                  LogGroup: { Ref: 'ReaderLogGroup' },
                  SystemLogLevel: 'WARN',
                },
                TracingConfig: { Mode: 'PassThrough' },
                Tags: tagList(),
              },
            },
            VercelOidcProvider: {
              Type: 'AWS::IAM::OIDCProvider',
              Properties: {
                Url: { 'Fn::Sub': 'https://oidc.vercel.com/${VercelTeamSlug}' },
                ClientIdList: [
                  { 'Fn::Sub': 'https://vercel.com/${VercelTeamSlug}' },
                ],
                Tags: tagList(),
              },
            },
            ReaderInvokeRole: {
              Type: 'AWS::IAM::Role',
              Properties: {
                Description:
                  'Invoke-only role for the exact Vercel site project Preview identity.',
                Path: '/admintonibover/',
                AssumeRolePolicyDocument: {
                  'Fn::Sub':
                    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Federated":"${VercelOidcProvider}"},"Action":"sts:AssumeRoleWithWebIdentity","Condition":{"StringEquals":{"oidc.vercel.com/${VercelTeamSlug}:aud":"https://vercel.com/${VercelTeamSlug}","oidc.vercel.com/${VercelTeamSlug}:sub":"owner:${VercelTeamSlug}:project:${VercelSiteProjectName}:environment:preview"}}}]}',
                },
                Policies: [
                  {
                    PolicyName: 'invoke-exact-reader',
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
                Tags: tagList(),
              },
            },
          }),
    },
    Outputs: {
      Region: {
        Description: `AWS Region containing the ${environmentLabel} stack.`,
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
      UserPoolIssuer: {
        Description: 'Public issuer URL used to verify Cognito JWTs.',
        Value: {
          'Fn::Sub':
            'https://cognito-idp.${AWS::Region}.${AWS::URLSuffix}/${UserPool}',
        },
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
      ...(isProduction
        ? {}
        : {
            ReaderFunctionName: {
              Description: 'Development published-only reader function name.',
              Value: { Ref: 'ReaderFunction' },
            },
            ReaderInvokeRoleArn: {
              Description: 'Development Vercel Preview invoke-only role ARN.',
              Value: { 'Fn::GetAtt': ['ReaderInvokeRole', 'Arn'] },
            },
          }),
    },
  };
}

export function createDevFoundationTemplate(): CloudFormationTemplate {
  return createFoundationTemplate('dev');
}

export function createProductionFoundationTemplate(): CloudFormationTemplate {
  return createFoundationTemplate('prod');
}
