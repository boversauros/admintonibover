import {
  EXACT_ADMIN_ORIGIN_PATTERN,
  EXACT_CALLBACK_URL_PATTERN,
  EXACT_LOGOUT_URL_PATTERN,
  EXACT_PRODUCTION_ADMIN_ORIGIN_PATTERN,
  EXACT_PRODUCTION_CALLBACK_URL_PATTERN,
  EXACT_PRODUCTION_LOGOUT_URL_PATTERN,
  EXPECTED_RESOURCE_TYPE_COUNTS,
  REQUIRED_TAGS,
  type CloudFormationTemplate,
  type FoundationEnvironment,
} from './dev-foundation';

type UnknownRecord = Record<string, unknown>;

const TAGGED_RESOURCES = [
  'ContentTable',
  'ContentBucket',
  'UserPool',
  'LambdaLogGroup',
  'LambdaExecutionRole',
  'FoundationFunction',
  'HttpApi',
  'ApiStage',
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(
  value: unknown,
  path: string,
  issues: string[]
): UnknownRecord {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return {};
  }
  return value;
}

function asArray(value: unknown, path: string, issues: string[]): unknown[] {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`);
    return [];
  }
  return value;
}

function requireEqual(
  actual: unknown,
  expected: unknown,
  path: string,
  issues: string[]
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    issues.push(
      `${path} must equal ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}

function extractTags(
  resourceName: string,
  properties: UnknownRecord,
  issues: string[]
): UnknownRecord {
  const tagProperty =
    resourceName === 'UserPool' ? properties.UserPoolTags : properties.Tags;

  if (isRecord(tagProperty)) return tagProperty;

  const tagList = asArray(
    tagProperty,
    `Resources.${resourceName}.tags`,
    issues
  );
  return Object.fromEntries(
    tagList.flatMap(entry => {
      if (!isRecord(entry) || typeof entry.Key !== 'string') {
        return [];
      }
      return [[entry.Key, entry.Value]];
    })
  );
}

export type InfrastructureValidationSummary = {
  resourceCount: number;
  resourceTypes: Record<string, number>;
  outputNames: string[];
};

export function validateFoundationTemplate(
  template: CloudFormationTemplate,
  environment: FoundationEnvironment
): InfrastructureValidationSummary {
  const issues: string[] = [];
  const resourceTypes: Record<string, number> = {};
  const isProduction = environment === 'prod';

  for (const [logicalId, resource] of Object.entries(template.Resources)) {
    resourceTypes[resource.Type] = (resourceTypes[resource.Type] ?? 0) + 1;
    if (!(resource.Type in EXPECTED_RESOURCE_TYPE_COUNTS)) {
      issues.push(
        `Resources.${logicalId} uses unapproved type ${resource.Type}`
      );
    }
  }

  for (const [resourceType, expectedCount] of Object.entries(
    EXPECTED_RESOURCE_TYPE_COUNTS
  )) {
    requireEqual(
      resourceTypes[resourceType],
      expectedCount,
      `resource type inventory.${resourceType}`,
      issues
    );
  }

  const environmentParameter = template.Parameters.Environment;
  requireEqual(
    environmentParameter?.Default,
    environment,
    'Environment.Default',
    issues
  );
  requireEqual(
    environmentParameter?.AllowedValues,
    [environment],
    'Environment.AllowedValues',
    issues
  );

  const deletionProtectionParameter =
    template.Parameters.EnableTableDeletionProtection;
  if (isProduction) {
    requireEqual(
      deletionProtectionParameter,
      undefined,
      'EnableTableDeletionProtection',
      issues
    );
  } else {
    requireEqual(
      deletionProtectionParameter?.Default,
      'false',
      'EnableTableDeletionProtection.Default',
      issues
    );
    requireEqual(
      deletionProtectionParameter?.AllowedValues,
      ['true', 'false'],
      'EnableTableDeletionProtection.AllowedValues',
      issues
    );
  }

  const guardrailParameter = template.Parameters.GuardrailsEvidenceConfirmed;
  requireEqual(
    guardrailParameter?.AllowedValues,
    ['CONFIRMED'],
    'GuardrailsEvidenceConfirmed.AllowedValues',
    issues
  );
  if ('Default' in guardrailParameter) {
    issues.push(
      'GuardrailsEvidenceConfirmed must not have a default acknowledgement'
    );
  }
  const existingSuperAdmin = template.Parameters.ExistingSuperAdminUsername;
  requireEqual(
    existingSuperAdmin?.NoEcho,
    true,
    'ExistingSuperAdminUsername.NoEcho',
    issues
  );
  requireEqual(
    existingSuperAdmin?.AllowedPattern,
    '^\\S+$',
    'ExistingSuperAdminUsername.AllowedPattern',
    issues
  );
  if ('Default' in existingSuperAdmin) {
    issues.push('ExistingSuperAdminUsername must not have a default');
  }
  requireEqual(
    template.Rules.GuardrailsMustBeConfirmed,
    {
      Assertions: [
        {
          Assert: {
            'Fn::Equals': [{ Ref: 'GuardrailsEvidenceConfirmed' }, 'CONFIRMED'],
          },
          AssertDescription:
            'Recheck the private account, identity, billing, Region, and resource baseline before deploying.',
        },
      ],
    },
    'Rules.GuardrailsMustBeConfirmed',
    issues
  );
  for (const [name, pattern] of [
    [
      'AllowedOrigins',
      isProduction
        ? EXACT_PRODUCTION_ADMIN_ORIGIN_PATTERN
        : EXACT_ADMIN_ORIGIN_PATTERN,
    ],
    [
      'CallbackUrls',
      isProduction
        ? EXACT_PRODUCTION_CALLBACK_URL_PATTERN
        : EXACT_CALLBACK_URL_PATTERN,
    ],
    [
      'LogoutUrls',
      isProduction
        ? EXACT_PRODUCTION_LOGOUT_URL_PATTERN
        : EXACT_LOGOUT_URL_PATTERN,
    ],
  ] as const) {
    const parameter = template.Parameters[name];
    requireEqual(
      parameter?.AllowedPattern,
      pattern,
      `${name}.AllowedPattern`,
      issues
    );
    if ('Default' in parameter) {
      issues.push(`${name} must not have a default`);
    }
  }

  for (const resourceName of TAGGED_RESOURCES) {
    const resource = template.Resources[resourceName];
    const properties = asRecord(
      resource?.Properties,
      `Resources.${resourceName}.Properties`,
      issues
    );
    const tags = extractTags(resourceName, properties, issues);
    requireEqual(tags, REQUIRED_TAGS, `Resources.${resourceName}.tags`, issues);
  }

  const expectedUpdateReplacePolicy = isProduction ? 'Retain' : 'Delete';
  for (const [resourceName, expectedDeletionPolicy] of [
    ['ContentTable', isProduction ? 'Retain' : 'Delete'],
    ['ContentBucket', isProduction ? 'RetainExceptOnCreate' : 'Delete'],
    ['UserPool', isProduction ? 'Retain' : 'Delete'],
    ['SuperAdminsGroup', isProduction ? 'Retain' : 'Delete'],
    ['EditorsGroup', isProduction ? 'Retain' : 'Delete'],
  ] as const) {
    const resource = template.Resources[resourceName];
    requireEqual(
      resource.DeletionPolicy,
      expectedDeletionPolicy,
      `Resources.${resourceName}.DeletionPolicy`,
      issues
    );
    requireEqual(
      resource.UpdateReplacePolicy,
      expectedUpdateReplacePolicy,
      `Resources.${resourceName}.UpdateReplacePolicy`,
      issues
    );
  }
  const initialMembership = template.Resources.InitialSuperAdminMembership;
  requireEqual(
    initialMembership.DeletionPolicy,
    isProduction ? 'Retain' : 'Delete',
    'Resources.InitialSuperAdminMembership.DeletionPolicy',
    issues
  );
  requireEqual(
    initialMembership.UpdateReplacePolicy,
    'Delete',
    'Resources.InitialSuperAdminMembership.UpdateReplacePolicy',
    issues
  );

  const table = asRecord(
    template.Resources.ContentTable.Properties,
    'Resources.ContentTable.Properties',
    issues
  );
  requireEqual(
    table.BillingMode,
    'PAY_PER_REQUEST',
    'ContentTable.BillingMode',
    issues
  );
  requireEqual(table.TableClass, 'STANDARD', 'ContentTable.TableClass', issues);
  requireEqual(
    table.GlobalSecondaryIndexes,
    undefined,
    'ContentTable.GlobalSecondaryIndexes',
    issues
  );
  requireEqual(
    table.LocalSecondaryIndexes,
    undefined,
    'ContentTable.LocalSecondaryIndexes',
    issues
  );
  requireEqual(
    table.StreamSpecification,
    undefined,
    'ContentTable.StreamSpecification',
    issues
  );
  const recovery = asRecord(
    table.PointInTimeRecoverySpecification,
    'ContentTable.PointInTimeRecoverySpecification',
    issues
  );
  requireEqual(
    recovery.PointInTimeRecoveryEnabled,
    false,
    'ContentTable.PointInTimeRecoveryEnabled',
    issues
  );
  requireEqual(
    table.TimeToLiveSpecification,
    { AttributeName: 'expiresAt', Enabled: true },
    'ContentTable.TimeToLiveSpecification',
    issues
  );
  requireEqual(
    table.DeletionProtectionEnabled,
    isProduction
      ? true
      : {
          'Fn::If': ['TableDeletionProtectionEnabled', true, false],
        },
    'ContentTable.DeletionProtectionEnabled',
    issues
  );

  const bucket = asRecord(
    template.Resources.ContentBucket.Properties,
    'Resources.ContentBucket.Properties',
    issues
  );
  const publicAccess = asRecord(
    bucket.PublicAccessBlockConfiguration,
    'ContentBucket.PublicAccessBlockConfiguration',
    issues
  );
  for (const setting of [
    'BlockPublicAcls',
    'BlockPublicPolicy',
    'IgnorePublicAcls',
    'RestrictPublicBuckets',
  ]) {
    requireEqual(
      publicAccess[setting],
      true,
      `ContentBucket.${setting}`,
      issues
    );
  }
  requireEqual(
    bucket.AccessControl,
    undefined,
    'ContentBucket.AccessControl',
    issues
  );
  requireEqual(
    bucket.OwnershipControls,
    { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
    'ContentBucket.OwnershipControls',
    issues
  );
  requireEqual(
    bucket.VersioningConfiguration,
    undefined,
    'ContentBucket.VersioningConfiguration',
    issues
  );
  const corsConfiguration = asRecord(
    bucket.CorsConfiguration,
    'ContentBucket.CorsConfiguration',
    issues
  );
  const corsRules = asArray(
    corsConfiguration.CorsRules,
    'ContentBucket.CorsConfiguration.CorsRules',
    issues
  );
  const corsRule = asRecord(
    corsRules[0],
    'ContentBucket.CorsConfiguration.CorsRules[0]',
    issues
  );
  requireEqual(
    corsRule.AllowedOrigins,
    { Ref: 'AllowedOrigins' },
    'ContentBucket.Cors.AllowedOrigins',
    issues
  );
  requireEqual(
    corsRules.length,
    1,
    'ContentBucket.Cors.CorsRules.length',
    issues
  );
  requireEqual(
    corsRule.AllowedMethods,
    ['GET', 'HEAD', 'PUT'],
    'ContentBucket.Cors.AllowedMethods',
    issues
  );
  requireEqual(
    corsRule.AllowedHeaders,
    ['content-type', 'x-amz-checksum-sha256'],
    'ContentBucket.Cors.AllowedHeaders',
    issues
  );
  requireEqual(
    corsRule.ExposedHeaders,
    undefined,
    'ContentBucket.Cors.ExposedHeaders',
    issues
  );
  requireEqual(corsRule.MaxAge, 300, 'ContentBucket.Cors.MaxAge', issues);
  requireEqual(
    bucket.LifecycleConfiguration,
    {
      Rules: [
        {
          Id: 'ExpireAbandonedTemporaryUploads',
          Prefix: 'temporary/',
          Status: 'Enabled',
          ExpirationInDays: 1,
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
        },
      ],
    },
    'ContentBucket.LifecycleConfiguration',
    issues
  );

  const bucketPolicy = asRecord(
    template.Resources.ContentBucketPolicy.Properties,
    'Resources.ContentBucketPolicy.Properties',
    issues
  );
  const policyDocument = asRecord(
    bucketPolicy.PolicyDocument,
    'ContentBucketPolicy.PolicyDocument',
    issues
  );
  const bucketStatements = asArray(
    policyDocument.Statement,
    'ContentBucketPolicy.PolicyDocument.Statement',
    issues
  );
  const staleSignatureStatement = bucketStatements.find(statement =>
    isRecord(statement)
      ? statement.Sid === 'DenyStalePresignedObjectRequests'
      : false
  );
  requireEqual(
    staleSignatureStatement,
    {
      Sid: 'DenyStalePresignedObjectRequests',
      Effect: 'Deny',
      Principal: '*',
      Action: ['s3:GetObject', 's3:PutObject'],
      Resource: { 'Fn::Sub': '${ContentBucket.Arn}/*' },
      Condition: {
        NumericGreaterThan: { 's3:signatureAge': '300000' },
      },
    },
    'ContentBucketPolicy.DenyStalePresignedObjectRequests',
    issues
  );
  for (const statement of bucketStatements) {
    if (
      isRecord(statement) &&
      statement.Effect === 'Allow' &&
      (statement.Principal === '*' ||
        (isRecord(statement.Principal) && statement.Principal.AWS === '*'))
    ) {
      issues.push('ContentBucketPolicy must not allow an anonymous principal');
    }
  }

  const userPool = asRecord(
    template.Resources.UserPool.Properties,
    'Resources.UserPool.Properties',
    issues
  );
  requireEqual(
    userPool.MfaConfiguration,
    'OFF',
    'UserPool.MfaConfiguration',
    issues
  );
  requireEqual(userPool.EnabledMfas, undefined, 'UserPool.EnabledMfas', issues);
  requireEqual(userPool.UserPoolTier, 'LITE', 'UserPool.UserPoolTier', issues);
  requireEqual(
    userPool.DeletionProtection,
    isProduction ? 'ACTIVE' : 'INACTIVE',
    'UserPool.DeletionProtection',
    issues
  );
  requireEqual(
    userPool.UserPoolAddOns,
    undefined,
    'UserPool.UserPoolAddOns',
    issues
  );
  const adminCreateUserConfig = asRecord(
    userPool.AdminCreateUserConfig,
    'UserPool.AdminCreateUserConfig',
    issues
  );
  requireEqual(
    adminCreateUserConfig.AllowAdminCreateUserOnly,
    true,
    'UserPool.AdminCreateUserConfig.AllowAdminCreateUserOnly',
    issues
  );
  requireEqual(
    adminCreateUserConfig.UnusedAccountValidityDays,
    undefined,
    'UserPool.AdminCreateUserConfig.UnusedAccountValidityDays',
    issues
  );
  const userPoolPolicies = asRecord(
    userPool.Policies,
    'UserPool.Policies',
    issues
  );
  const passwordPolicy = asRecord(
    userPoolPolicies.PasswordPolicy,
    'UserPool.Policies.PasswordPolicy',
    issues
  );
  requireEqual(
    passwordPolicy.TemporaryPasswordValidityDays,
    3,
    'UserPool.Policies.PasswordPolicy.TemporaryPasswordValidityDays',
    issues
  );

  for (const [resourceName, groupName, precedence] of [
    ['SuperAdminsGroup', 'super-admins', 0],
    ['EditorsGroup', 'editors', 10],
  ] as const) {
    const group = asRecord(
      template.Resources[resourceName].Properties,
      `Resources.${resourceName}.Properties`,
      issues
    );
    requireEqual(
      group.GroupName,
      groupName,
      `${resourceName}.GroupName`,
      issues
    );
    requireEqual(
      group.Precedence,
      precedence,
      `${resourceName}.Precedence`,
      issues
    );
    requireEqual(
      group.UserPoolId,
      { Ref: 'UserPool' },
      `${resourceName}.UserPoolId`,
      issues
    );
    requireEqual(group.RoleArn, undefined, `${resourceName}.RoleArn`, issues);
  }
  const membership = asRecord(
    initialMembership.Properties,
    'Resources.InitialSuperAdminMembership.Properties',
    issues
  );
  requireEqual(
    initialMembership.DependsOn,
    'SuperAdminsGroup',
    'InitialSuperAdminMembership.DependsOn',
    issues
  );
  requireEqual(
    membership.GroupName,
    'super-admins',
    'InitialSuperAdminMembership.GroupName',
    issues
  );
  requireEqual(
    membership.Username,
    { Ref: 'ExistingSuperAdminUsername' },
    'InitialSuperAdminMembership.Username',
    issues
  );
  requireEqual(
    membership.UserPoolId,
    { Ref: 'UserPool' },
    'InitialSuperAdminMembership.UserPoolId',
    issues
  );

  const client = asRecord(
    template.Resources.UserPoolClient.Properties,
    'Resources.UserPoolClient.Properties',
    issues
  );
  requireEqual(
    client.GenerateSecret,
    false,
    'UserPoolClient.GenerateSecret',
    issues
  );
  requireEqual(
    client.AllowedOAuthFlows,
    ['code'],
    'UserPoolClient.AllowedOAuthFlows',
    issues
  );
  requireEqual(
    client.AllowedOAuthScopes,
    [
      'openid',
      'email',
      'profile',
      'aws.cognito.signin.user.admin',
      'admintonibover-api/admin',
    ],
    'UserPoolClient.AllowedOAuthScopes',
    issues
  );
  requireEqual(
    client.ExplicitAuthFlows,
    ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
    'UserPoolClient.ExplicitAuthFlows',
    issues
  );
  requireEqual(
    client.CallbackURLs,
    { Ref: 'CallbackUrls' },
    'UserPoolClient.CallbackURLs',
    issues
  );
  requireEqual(
    client.LogoutURLs,
    { Ref: 'LogoutUrls' },
    'UserPoolClient.LogoutURLs',
    issues
  );
  requireEqual(
    client.DefaultRedirectURI,
    undefined,
    'UserPoolClient.DefaultRedirectURI',
    issues
  );

  const lambda = asRecord(
    template.Resources.FoundationFunction.Properties,
    'Resources.FoundationFunction.Properties',
    issues
  );
  requireEqual(
    lambda.Runtime,
    'nodejs24.x',
    'FoundationFunction.Runtime',
    issues
  );
  requireEqual(
    lambda.Architectures,
    ['arm64'],
    'FoundationFunction.Architectures',
    issues
  );
  requireEqual(lambda.MemorySize, 256, 'FoundationFunction.MemorySize', issues);
  requireEqual(lambda.Timeout, 30, 'FoundationFunction.Timeout', issues);
  requireEqual(
    template.Resources.FoundationFunction.DependsOn,
    'InitialSuperAdminMembership',
    'FoundationFunction.DependsOn',
    issues
  );
  const lambdaEnvironment = asRecord(
    lambda.Environment,
    'FoundationFunction.Environment',
    issues
  );
  const lambdaVariables = asRecord(
    lambdaEnvironment.Variables,
    'FoundationFunction.Environment.Variables',
    issues
  );
  requireEqual(
    lambdaVariables.BACKUP_ENVIRONMENT,
    { Ref: 'Environment' },
    'FoundationFunction.Environment.BACKUP_ENVIRONMENT',
    issues
  );
  requireEqual(
    lambdaVariables.REQUIRED_ADMIN_SCOPE,
    undefined,
    'FoundationFunction.Environment.REQUIRED_ADMIN_SCOPE',
    issues
  );
  const lambdaCode = asRecord(lambda.Code, 'FoundationFunction.Code', issues);
  if (
    typeof lambdaCode.ZipFile !== 'string' ||
    Buffer.byteLength(lambdaCode.ZipFile, 'utf8') > 950_000
  ) {
    issues.push(
      'FoundationFunction inline bundle must be at most 950000 bytes'
    );
  }
  requireEqual(
    lambda.ReservedConcurrentExecutions,
    undefined,
    'FoundationFunction.ReservedConcurrentExecutions',
    issues
  );
  requireEqual(
    lambda.VpcConfig,
    undefined,
    'FoundationFunction.VpcConfig',
    issues
  );
  requireEqual(
    lambda.ProvisionedConcurrencyConfig,
    undefined,
    'FoundationFunction.ProvisionedConcurrencyConfig',
    issues
  );

  const logGroup = asRecord(
    template.Resources.LambdaLogGroup.Properties,
    'Resources.LambdaLogGroup.Properties',
    issues
  );
  requireEqual(
    logGroup.RetentionInDays,
    14,
    'LambdaLogGroup.RetentionInDays',
    issues
  );

  const expectedProtectedRoutes = {
    FoundationRoute: 'GET /health',
    PostsListRoute: 'GET /posts',
    PostCreateRoute: 'POST /posts',
    PostsBulkPublicationRoute: 'POST /posts/publication/bulk',
    PostReadRoute: 'GET /posts/{id}',
    PostUpdateRoute: 'PUT /posts/{id}',
    PostDeleteRoute: 'DELETE /posts/{id}',
    PostPublicationRoute: 'PUT /posts/{id}/publication',
    PostImagesReadRoute: 'GET /posts/{id}/images',
    PostImagePresignRoute: 'POST /posts/{id}/images/presign',
    PostImageConfirmRoute: 'POST /posts/{id}/images/confirm',
    PostImageDetachRoute: 'DELETE /posts/{id}/images/{role}',
    CategoriesListRoute: 'GET /categories',
    CategoryCreateRoute: 'POST /categories',
    CategoryUpdateRoute: 'PUT /categories/{id}',
    CategoryDeleteRoute: 'DELETE /categories/{id}',
    KeywordsListRoute: 'GET /keywords',
    KeywordCreateRoute: 'POST /keywords',
    KeywordUpdateRoute: 'PUT /keywords/{id}',
    KeywordDeleteRoute: 'DELETE /keywords/{id}',
    BackupDownloadRoute: 'GET /backup',
    UsersListRoute: 'GET /users',
    UserInviteRoute: 'POST /users',
    UserActionRoute: 'POST /users/{username}/actions',
  } as const;
  for (const [logicalId, routeKey] of Object.entries(expectedProtectedRoutes)) {
    const protectedRoute = asRecord(
      template.Resources[logicalId].Properties,
      `Resources.${logicalId}.Properties`,
      issues
    );
    requireEqual(
      protectedRoute.AuthorizationType,
      'JWT',
      `${logicalId}.AuthorizationType`,
      issues
    );
    requireEqual(
      template.Resources[logicalId].DependsOn,
      'InitialSuperAdminMembership',
      `${logicalId}.DependsOn`,
      issues
    );
    requireEqual(
      protectedRoute.AuthorizationScopes,
      undefined,
      `${logicalId}.AuthorizationScopes`,
      issues
    );
    requireEqual(
      protectedRoute.AuthorizerId,
      { Ref: 'JwtAuthorizer' },
      `${logicalId}.AuthorizerId`,
      issues
    );
    requireEqual(
      protectedRoute.RouteKey,
      routeKey,
      `${logicalId}.RouteKey`,
      issues
    );
    requireEqual(
      protectedRoute.Target,
      {
        'Fn::Join': ['/', ['integrations', { Ref: 'FoundationIntegration' }]],
      },
      `${logicalId}.Target`,
      issues
    );
  }

  const jwtAuthorizer = asRecord(
    template.Resources.JwtAuthorizer.Properties,
    'Resources.JwtAuthorizer.Properties',
    issues
  );
  requireEqual(
    jwtAuthorizer.AuthorizerType,
    'JWT',
    'JwtAuthorizer.AuthorizerType',
    issues
  );
  requireEqual(
    jwtAuthorizer.IdentitySource,
    ['$request.header.Authorization'],
    'JwtAuthorizer.IdentitySource',
    issues
  );
  requireEqual(
    jwtAuthorizer.JwtConfiguration,
    {
      Audience: [{ Ref: 'UserPoolClient' }],
      Issuer: {
        'Fn::Sub':
          'https://cognito-idp.${AWS::Region}.${AWS::URLSuffix}/${UserPool}',
      },
    },
    'JwtAuthorizer.JwtConfiguration',
    issues
  );

  const httpApi = asRecord(
    template.Resources.HttpApi.Properties,
    'Resources.HttpApi.Properties',
    issues
  );
  const apiCors = asRecord(
    httpApi.CorsConfiguration,
    'HttpApi.CorsConfiguration',
    issues
  );
  requireEqual(
    apiCors.AllowOrigins,
    { Ref: 'AllowedOrigins' },
    'HttpApi.Cors.AllowOrigins',
    issues
  );
  requireEqual(
    apiCors.AllowMethods,
    ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    'HttpApi.Cors.AllowMethods',
    issues
  );
  requireEqual(
    apiCors.AllowCredentials,
    false,
    'HttpApi.Cors.AllowCredentials',
    issues
  );
  requireEqual(
    apiCors.AllowHeaders,
    [
      'authorization',
      'content-type',
      'idempotency-key',
      'if-match',
      'x-correlation-id',
    ],
    'HttpApi.Cors.AllowHeaders',
    issues
  );
  requireEqual(
    apiCors.ExposeHeaders,
    ['etag', 'x-correlation-id'],
    'HttpApi.Cors.ExposeHeaders',
    issues
  );
  requireEqual(apiCors.MaxAge, 300, 'HttpApi.Cors.MaxAge', issues);

  const stage = asRecord(
    template.Resources.ApiStage.Properties,
    'Resources.ApiStage.Properties',
    issues
  );
  requireEqual(stage.StageName, '$default', 'ApiStage.StageName', issues);
  const defaultRouteSettings = asRecord(
    stage.DefaultRouteSettings,
    'ApiStage.DefaultRouteSettings',
    issues
  );
  requireEqual(
    defaultRouteSettings.ThrottlingRateLimit,
    2,
    'ApiStage.ThrottlingRateLimit',
    issues
  );
  requireEqual(
    defaultRouteSettings.ThrottlingBurstLimit,
    4,
    'ApiStage.ThrottlingBurstLimit',
    issues
  );

  const apiInvokePermission = asRecord(
    template.Resources.ApiInvokePermission.Properties,
    'Resources.ApiInvokePermission.Properties',
    issues
  );
  requireEqual(
    apiInvokePermission.SourceArn,
    {
      'Fn::Sub':
        'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${HttpApi}/*/*',
    },
    'ApiInvokePermission.SourceArn',
    issues
  );

  const executionRole = asRecord(
    template.Resources.LambdaExecutionRole.Properties,
    'Resources.LambdaExecutionRole.Properties',
    issues
  );
  const policies = asArray(
    executionRole.Policies,
    'LambdaExecutionRole.Policies',
    issues
  );
  const serializedPolicies = JSON.stringify(policies);
  if (serializedPolicies.includes('"Action":"*"')) {
    issues.push('Lambda execution role must not contain wildcard actions');
  }
  if (serializedPolicies.includes('"Resource":"*"')) {
    issues.push(
      'Lambda execution role must not contain a literal wildcard resource'
    );
  }
  for (const transactionalItemAction of [
    'dynamodb:DeleteItem',
    'dynamodb:GetItem',
    'dynamodb:PutItem',
    'dynamodb:Scan',
    'dynamodb:UpdateItem',
  ]) {
    if (!serializedPolicies.includes(transactionalItemAction)) {
      issues.push(
        `Lambda execution role is missing exact-table action ${transactionalItemAction}`
      );
    }
  }
  const cognitoActions = [
    'cognito-idp:ListUsers',
    'cognito-idp:AdminListGroupsForUser',
    'cognito-idp:AdminGetUser',
    'cognito-idp:AdminCreateUser',
    'cognito-idp:AdminAddUserToGroup',
    'cognito-idp:AdminResetUserPassword',
    'cognito-idp:AdminEnableUser',
    'cognito-idp:AdminDisableUser',
    'cognito-idp:AdminUserGlobalSignOut',
  ];
  for (const action of cognitoActions) {
    if (!serializedPolicies.includes(action)) {
      issues.push(`Lambda execution role is missing Cognito action ${action}`);
    }
  }
  const cognitoStatement = policies
    .flatMap(policy => {
      const entry = asRecord(policy, 'LambdaExecutionRole.Policy', issues);
      const document = asRecord(
        entry.PolicyDocument,
        'LambdaExecutionRole.PolicyDocument',
        issues
      );
      return asArray(
        document.Statement,
        'LambdaExecutionRole.PolicyDocument.Statement',
        issues
      );
    })
    .find(statement => {
      const record = asRecord(
        statement,
        'LambdaExecutionRole.PolicyDocument.Statement',
        issues
      );
      return record.Sid === 'ManageUsersInExactPool';
    });
  if (
    !cognitoStatement ||
    JSON.stringify(
      asRecord(cognitoStatement, 'ManageUsersInExactPool', issues).Resource
    ) !== JSON.stringify({ 'Fn::GetAtt': ['UserPool', 'Arn'] })
  ) {
    issues.push(
      'Cognito user administration must be scoped to the exact UserPool ARN'
    );
  }
  for (const forbiddenAction of ['logs:CreateLogGroup', 's3:*']) {
    if (serializedPolicies.includes(forbiddenAction)) {
      issues.push(
        `Lambda execution role contains forbidden action ${forbiddenAction}`
      );
    }
  }

  const outputNames = Object.keys(template.Outputs);
  for (const outputName of outputNames) {
    if (/secret|password|credential|token/i.test(outputName)) {
      issues.push(`Output ${outputName} could expose secret material`);
    }
  }
  for (const requiredOutput of [
    'Region',
    'Environment',
    'ApiUrl',
    'UserPoolId',
    'UserPoolClientId',
    'UserPoolIssuer',
    'TableName',
    'BucketName',
  ]) {
    if (!(requiredOutput in template.Outputs)) {
      issues.push(`Required output ${requiredOutput} is missing`);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `${isProduction ? 'Production' : 'Development'} foundation validation failed:\n- ${issues.join('\n- ')}`
    );
  }

  return {
    resourceCount: Object.keys(template.Resources).length,
    resourceTypes,
    outputNames,
  };
}

export function validateDevFoundationTemplate(
  template: CloudFormationTemplate
): InfrastructureValidationSummary {
  return validateFoundationTemplate(template, 'dev');
}

export function validateProductionFoundationTemplate(
  template: CloudFormationTemplate
): InfrastructureValidationSummary {
  return validateFoundationTemplate(template, 'prod');
}
