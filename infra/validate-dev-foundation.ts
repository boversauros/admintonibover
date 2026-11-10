import {
  EXACT_ADMIN_ORIGIN_PATTERN,
  EXACT_PRODUCTION_ADMIN_ORIGIN_PATTERN,
  EXPECTED_RESOURCE_TYPE_COUNTS,
  EXPECTED_DEV_RESOURCE_TYPE_COUNTS,
  type CloudFormationTemplate,
  type FoundationEnvironment,
} from './dev-foundation';

// Security and cost invariants of the synthesized foundation templates. The
// generator is deterministic and CI compares the committed synthesis byte for
// byte, so this guards only what must never drift: the approved resource
// inventory, data retention, public exposure, identity and IAM scope, CORS
// origins, throttling and billable shape. Structure the generator already
// guarantees (names, wiring, headers, tags) is deliberately not repeated here.

const TEMPLATE_BYTE_LIMIT = 1024 * 1024;
const INLINE_BUNDLE_BYTE_LIMIT = 950_000;

const READER_ALLOWED_ACTIONS = new Set([
  'logs:CreateLogStream',
  'logs:PutLogEvents',
  'dynamodb:GetItem',
  'dynamodb:Query',
  's3:GetObject',
]);

const READER_TRUST_POLICY =
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Federated":"${VercelOidcProvider}"},"Action":"sts:AssumeRoleWithWebIdentity","Condition":{"StringEquals":{"oidc.vercel.com/${VercelTeamSlug}:aud":"https://vercel.com/${VercelTeamSlug}","oidc.vercel.com/${VercelTeamSlug}:sub":"owner:${VercelTeamSlug}:project:${VercelSiteProjectName}:environment:preview"}}}]}';

const FORBIDDEN_ROLE_ACTIONS = ['logs:CreateLogGroup'];

type UnknownRecord = Record<string, unknown>;

// Expected values keyed by root (resource or parameter) and dotted path.
type Expectations = Record<string, Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function at(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path.split('.')) {
    if (Array.isArray(current) && /^\d+$/.test(key)) {
      current = current[Number(key)];
    } else if (isRecord(current)) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

function byKey(items: unknown, key: string): UnknownRecord {
  return Object.fromEntries(
    list(items).map(item => [String(at(item, key)), item])
  );
}

function compare(
  issues: string[],
  label: string,
  actual: unknown,
  expected: unknown
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    issues.push(
      `${label} must equal ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}

function expectAll(
  issues: string[],
  roots: UnknownRecord,
  expectations: Expectations
): void {
  for (const [root, fields] of Object.entries(expectations)) {
    for (const [path, expected] of Object.entries(fields)) {
      compare(issues, `${root}.${path}`, at(roots[root], path), expected);
    }
  }
}

function roleStatements(
  template: CloudFormationTemplate,
  roleId: string
): UnknownRecord[] {
  return list(at(template.Resources[roleId], 'Properties.Policies'))
    .flatMap(policy => list(at(policy, 'PolicyDocument.Statement')))
    .filter(isRecord);
}

// An IAM resource is exact when it is the ARN of a resource in this stack, or
// a path under one (`${ContentBucket.Arn}/images/*`).
function isStackResourceArn(
  resource: unknown,
  template: CloudFormationTemplate
): boolean {
  const getAtt = at(resource, 'Fn::GetAtt.0');
  if (typeof getAtt === 'string') return getAtt in template.Resources;
  const sub = at(resource, 'Fn::Sub');
  const match = typeof sub === 'string' ? /^\$\{(\w+)\.Arn\}/.exec(sub) : null;
  return match !== null && match[1] in template.Resources;
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
  const isProduction = environment === 'prod';
  const resources = template.Resources;
  const properties: UnknownRecord = Object.fromEntries(
    Object.entries(resources).map(([id, resource]) => [id, resource.Properties])
  );
  const issues: string[] = [];

  // Inventory: no unapproved service and no extra billable resource.
  const serialized = `${JSON.stringify(template, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > TEMPLATE_BYTE_LIMIT) {
    issues.push('Template exceeds the CloudFormation 1 MiB S3 template limit');
  }
  const expectedTypes: Record<string, number> = isProduction
    ? EXPECTED_RESOURCE_TYPE_COUNTS
    : EXPECTED_DEV_RESOURCE_TYPE_COUNTS;
  const resourceTypes: Record<string, number> = {};
  for (const [id, resource] of Object.entries(resources)) {
    resourceTypes[resource.Type] = (resourceTypes[resource.Type] ?? 0) + 1;
    if (!(resource.Type in expectedTypes)) {
      issues.push(`Resources.${id} uses unapproved type ${resource.Type}`);
    }
  }
  for (const [type, count] of Object.entries(expectedTypes)) {
    compare(issues, `resource count ${type}`, resourceTypes[type], count);
  }

  // Parameters: a template deploys only to its own environment, only after
  // the guardrail acknowledgement, and never with defaulted identity inputs.
  expectAll(issues, template, {
    Parameters: {
      'Environment.AllowedValues': [environment],
      'GuardrailsEvidenceConfirmed.AllowedValues': ['CONFIRMED'],
      'GuardrailsEvidenceConfirmed.Default': undefined,
      'AllowedOrigins.AllowedPattern': isProduction
        ? EXACT_PRODUCTION_ADMIN_ORIGIN_PATTERN
        : EXACT_ADMIN_ORIGIN_PATTERN,
      'AllowedOrigins.Default': undefined,
      'ExistingSuperAdminUsername.NoEcho': true,
      'ExistingSuperAdminUsername.Default': undefined,
      ...(isProduction
        ? {}
        : {
            'VercelTeamSlug.Default': undefined,
            'VercelSiteProjectName.Default': undefined,
            'ReaderCodeObjectKey.Default': undefined,
          }),
    },
    Rules: {
      'GuardrailsMustBeConfirmed.Assertions.0.Assert': {
        'Fn::Equals': [{ Ref: 'GuardrailsEvidenceConfirmed' }, 'CONFIRMED'],
      },
    },
  });

  // Retention: production keeps every data-bearing resource.
  const retain = isProduction ? 'Retain' : 'Delete';
  const retained = (deletionPolicy = retain) => ({
    DeletionPolicy: deletionPolicy,
    UpdateReplacePolicy: retain,
  });
  expectAll(issues, resources, {
    ContentTable: retained(),
    ContentBucket: retained(isProduction ? 'RetainExceptOnCreate' : 'Delete'),
    UserPool: retained(),
    SuperAdminsGroup: retained(),
    EditorsGroup: retained(),
    InitialSuperAdminMembership: { DeletionPolicy: retain },
  });

  expectAll(issues, properties, {
    // Table: on-demand billing, point-in-time recovery, deletion protection.
    ContentTable: {
      BillingMode: 'PAY_PER_REQUEST',
      'PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled': true,
      DeletionProtectionEnabled: isProduction
        ? true
        : { 'Fn::If': ['TableDeletionProtectionEnabled', true, false] },
    },
    // Bucket: private, owner-enforced, versioned, exact CORS origins.
    ContentBucket: {
      'PublicAccessBlockConfiguration.BlockPublicAcls': true,
      'PublicAccessBlockConfiguration.BlockPublicPolicy': true,
      'PublicAccessBlockConfiguration.IgnorePublicAcls': true,
      'PublicAccessBlockConfiguration.RestrictPublicBuckets': true,
      AccessControl: undefined,
      OwnershipControls: {
        Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }],
      },
      VersioningConfiguration: { Status: 'Enabled' },
      'CorsConfiguration.CorsRules.1': undefined,
      'CorsConfiguration.CorsRules.0.AllowedOrigins': { Ref: 'AllowedOrigins' },
      'CorsConfiguration.CorsRules.0.AllowedMethods': ['GET', 'HEAD', 'PUT'],
    },
    // Cognito: invitation-only, Lite tier, no hosted login, no group roles.
    UserPool: {
      'AdminCreateUserConfig.AllowAdminCreateUserOnly': true,
      UserPoolTier: 'LITE',
      UserPoolAddOns: undefined,
      DeletionProtection: isProduction ? 'ACTIVE' : 'INACTIVE',
    },
    UserPoolClient: {
      ExplicitAuthFlows: [
        'ALLOW_USER_PASSWORD_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH',
      ],
      AllowedOAuthFlowsUserPoolClient: undefined,
      AllowedOAuthFlows: undefined,
      AllowedOAuthScopes: undefined,
      CallbackURLs: undefined,
      LogoutURLs: undefined,
      DefaultRedirectURI: undefined,
    },
    SuperAdminsGroup: { RoleArn: undefined },
    EditorsGroup: { RoleArn: undefined },
    // API: Cognito JWTs, exact CORS origins without credentials, throttled,
    // invocable only from this API.
    JwtAuthorizer: {
      JwtConfiguration: {
        Audience: [{ Ref: 'UserPoolClient' }],
        Issuer: {
          'Fn::Sub':
            'https://cognito-idp.${AWS::Region}.${AWS::URLSuffix}/${UserPool}',
        },
      },
    },
    HttpApi: {
      'CorsConfiguration.AllowOrigins': { Ref: 'AllowedOrigins' },
      'CorsConfiguration.AllowCredentials': false,
    },
    ApiStage: {
      'DefaultRouteSettings.ThrottlingRateLimit': 2,
      'DefaultRouteSettings.ThrottlingBurstLimit': 4,
    },
    ApiInvokePermission: {
      SourceArn: {
        'Fn::Sub':
          'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${HttpApi}/*/*',
      },
    },
    // Lambda: bounded cost, no VPC/NAT, no reserved capacity, short logs.
    FoundationFunction: {
      Architectures: ['arm64'],
      MemorySize: 256,
      Timeout: 30,
      ReservedConcurrentExecutions: undefined,
      ProvisionedConcurrencyConfig: undefined,
      VpcConfig: undefined,
    },
    LambdaLogGroup: { RetentionInDays: 14 },
    // Every route, including any added later, sits behind the JWT authorizer.
    ...Object.fromEntries(
      Object.entries(resources)
        .filter(([, resource]) => resource.Type === 'AWS::ApiGatewayV2::Route')
        .map(([id]) => [
          id,
          { AuthorizationType: 'JWT', AuthorizerId: { Ref: 'JwtAuthorizer' } },
        ])
    ),
  });

  // Lifecycle rules and policy statements, addressed by their Id or Sid.
  const bucketStatements = at(
    properties.ContentBucketPolicy,
    'PolicyDocument.Statement'
  );
  expectAll(
    issues,
    {
      ContentBucketLifecycle: byKey(
        at(properties.ContentBucket, 'LifecycleConfiguration.Rules'),
        'Id'
      ),
      ContentBucketPolicy: byKey(bucketStatements, 'Sid'),
      LambdaExecutionRole: byKey(
        roleStatements(template, 'LambdaExecutionRole'),
        'Sid'
      ),
    },
    {
      // Abandoned uploads and previous object versions expire.
      ContentBucketLifecycle: {
        'ExpireAbandonedTemporaryUploads.ExpirationInDays': 1,
        'ExpirePreviousObjectVersions.NoncurrentVersionExpiration.NoncurrentDays': 35,
      },
      // TLS only and short-lived presigned URLs.
      ContentBucketPolicy: {
        DenyInsecureTransport: {
          Sid: 'DenyInsecureTransport',
          Effect: 'Deny',
          Principal: '*',
          Action: 's3:*',
          Resource: [
            { 'Fn::GetAtt': ['ContentBucket', 'Arn'] },
            { 'Fn::Sub': '${ContentBucket.Arn}/*' },
          ],
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        },
        DenyStalePresignedObjectRequests: {
          Sid: 'DenyStalePresignedObjectRequests',
          Effect: 'Deny',
          Principal: '*',
          Action: ['s3:GetObject', 's3:PutObject'],
          Resource: { 'Fn::Sub': '${ContentBucket.Arn}/*' },
          Condition: { NumericGreaterThan: { 's3:signatureAge': '300000' } },
        },
      },
      // User administration is limited to this user pool.
      LambdaExecutionRole: {
        'ManageUsersInExactPool.Resource': {
          'Fn::GetAtt': ['UserPool', 'Arn'],
        },
      },
    }
  );
  for (const statement of list(bucketStatements)) {
    const principal = at(statement, 'Principal');
    if (
      at(statement, 'Effect') === 'Allow' &&
      (principal === '*' || at(principal, 'AWS') === '*')
    ) {
      issues.push('ContentBucketPolicy must not allow an anonymous principal');
    }
  }

  const inlineBundle = at(properties.FoundationFunction, 'Code.ZipFile');
  if (
    typeof inlineBundle !== 'string' ||
    Buffer.byteLength(inlineBundle, 'utf8') > INLINE_BUNDLE_BYTE_LIMIT
  ) {
    issues.push(
      `FoundationFunction inline bundle must be at most ${INLINE_BUNDLE_BYTE_LIMIT} bytes`
    );
  }

  // IAM: inline policies only, no wildcard actions, every resource an exact
  // ARN in this stack.
  for (const [roleId, role] of Object.entries(resources)) {
    if (role.Type !== 'AWS::IAM::Role') continue;
    if (at(role.Properties, 'ManagedPolicyArns') !== undefined) {
      issues.push(`${roleId} must not attach managed policies`);
    }
    for (const statement of roleStatements(template, roleId)) {
      if (statement.Effect !== 'Allow') continue;
      const label = `${roleId}.${String(statement.Sid ?? 'statement')}`;
      for (const action of list(statement.Action)) {
        if (typeof action !== 'string' || action.includes('*')) {
          issues.push(`${label} must not use wildcard action ${action}`);
        } else if (FORBIDDEN_ROLE_ACTIONS.includes(action)) {
          issues.push(`${label} contains forbidden action ${action}`);
        }
      }
      const scoped = list(statement.Resource);
      if (
        !scoped.length ||
        !scoped.every(r => isStackResourceArn(r, template))
      ) {
        issues.push(`${label} must be scoped to exact resources in this stack`);
      }
    }
  }

  // Site reader (development only; the production inventory has no room for
  // it): a read-only role over published images, invocable only by the exact
  // Vercel Preview identity.
  if (!isProduction) {
    for (const statement of roleStatements(template, 'ReaderExecutionRole')) {
      const actions = list(statement.Action).map(String);
      for (const action of actions) {
        if (!READER_ALLOWED_ACTIONS.has(action)) {
          issues.push(`ReaderExecutionRole must not allow ${action}`);
        }
      }
      const imagesOnly = list(statement.Resource).every(item =>
        String(at(item, 'Fn::Sub')).endsWith('/images/posts/*')
      );
      if (actions.some(action => action.startsWith('s3:')) && !imagesOnly) {
        issues.push('ReaderExecutionRole may read only images/posts/*');
      }
    }
    expectAll(issues, properties, {
      VercelOidcProvider: {
        Url: { 'Fn::Sub': 'https://oidc.vercel.com/${VercelTeamSlug}' },
      },
      ReaderInvokeRole: {
        // Exact audience and subject: only this project's Preview deployments.
        'AssumeRolePolicyDocument.Fn::Sub': READER_TRUST_POLICY,
        'Policies.0.PolicyDocument.Statement': [
          {
            Effect: 'Allow',
            Action: ['lambda:InvokeFunction'],
            Resource: { 'Fn::GetAtt': ['ReaderFunction', 'Arn'] },
          },
        ],
        'Policies.1': undefined,
      },
    });
  }

  const outputNames = Object.keys(template.Outputs);
  for (const name of outputNames) {
    if (/secret|password|credential|token/i.test(name)) {
      issues.push(`Output ${name} could expose secret material`);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `${isProduction ? 'Production' : 'Development'} foundation validation failed:\n- ${issues.join('\n- ')}`
    );
  }

  return {
    resourceCount: Object.keys(resources).length,
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
