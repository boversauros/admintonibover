import {
  EXPECTED_RESOURCE_TYPE_COUNTS,
  REQUIRED_TAGS,
  type CloudFormationTemplate,
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

export function validateDevFoundationTemplate(
  template: CloudFormationTemplate
): InfrastructureValidationSummary {
  const issues: string[] = [];
  const resourceTypes: Record<string, number> = {};

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
  requireEqual(
    template.Rules.GuardrailsMustBeConfirmed,
    {
      Assertions: [
        {
          Assert: {
            'Fn::Equals': [{ Ref: 'GuardrailsEvidenceConfirmed' }, 'CONFIRMED'],
          },
          AssertDescription:
            'Recheck the private account, identity, billing, Region, and resource-baseline evidence from issue #3 before deploying.',
        },
      ],
    },
    'Rules.GuardrailsMustBeConfirmed',
    issues
  );

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
    bucket.VersioningConfiguration,
    undefined,
    'ContentBucket.VersioningConfiguration',
    issues
  );

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
    client.ExplicitAuthFlows,
    ['ALLOW_REFRESH_TOKEN_AUTH'],
    'UserPoolClient.ExplicitAuthFlows',
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

  const route = asRecord(
    template.Resources.FoundationRoute.Properties,
    'Resources.FoundationRoute.Properties',
    issues
  );
  requireEqual(
    route.AuthorizationType,
    'JWT',
    'FoundationRoute.AuthorizationType',
    issues
  );
  requireEqual(
    route.AuthorizationScopes,
    ['admintonibover-api/admin'],
    'FoundationRoute.AuthorizationScopes',
    issues
  );
  requireEqual(
    route.RouteKey,
    'GET /health',
    'FoundationRoute.RouteKey',
    issues
  );

  const postReadRoute = asRecord(
    template.Resources.PostReadRoute.Properties,
    'Resources.PostReadRoute.Properties',
    issues
  );
  requireEqual(
    postReadRoute.AuthorizationType,
    'JWT',
    'PostReadRoute.AuthorizationType',
    issues
  );
  requireEqual(
    postReadRoute.AuthorizationScopes,
    ['admintonibover-api/admin'],
    'PostReadRoute.AuthorizationScopes',
    issues
  );
  requireEqual(
    postReadRoute.AuthorizerId,
    { Ref: 'JwtAuthorizer' },
    'PostReadRoute.AuthorizerId',
    issues
  );
  requireEqual(
    postReadRoute.RouteKey,
    'GET /posts/{id}',
    'PostReadRoute.RouteKey',
    issues
  );
  requireEqual(
    postReadRoute.Target,
    {
      'Fn::Join': [
        '/',
        ['integrations', { Ref: 'FoundationIntegration' }],
      ],
    },
    'PostReadRoute.Target',
    issues
  );

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

  const postReadPermission = asRecord(
    template.Resources.PostReadInvokePermission.Properties,
    'Resources.PostReadInvokePermission.Properties',
    issues
  );
  requireEqual(
    postReadPermission.SourceArn,
    {
      'Fn::Sub':
        'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${HttpApi}/*/GET/posts/*',
    },
    'PostReadInvokePermission.SourceArn',
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
  for (const forbiddenAction of [
    'dynamodb:Scan',
    'logs:CreateLogGroup',
    's3:*',
  ]) {
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
      `Development foundation validation failed:\n- ${issues.join('\n- ')}`
    );
  }

  return {
    resourceCount: Object.keys(template.Resources).length,
    resourceTypes,
    outputNames,
  };
}
