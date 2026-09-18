export const COGNITO_GROUPS = {
  editor: 'editors',
  superAdmin: 'super-admins',
} as const;

export type CognitoGroup = (typeof COGNITO_GROUPS)[keyof typeof COGNITO_GROUPS];

export const CONTENT_OPERATION_GROUPS: readonly CognitoGroup[] = [
  COGNITO_GROUPS.superAdmin,
  COGNITO_GROUPS.editor,
];

function stringValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof value !== 'string') return [];

  const normalized = value.trim();
  if (normalized.length === 0) return [];

  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(normalized);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (entry): entry is string => typeof entry === 'string'
        );
      }
    } catch {
      return normalized
        .slice(1, -1)
        .split(/[\s,]+/)
        .map(entry => entry.replace(/^['"]|['"]$/g, ''));
    }
  }

  return normalized.split(/[\s,]+/);
}

export function parseCognitoGroups(value: unknown): CognitoGroup[] {
  const allowed = new Set<CognitoGroup>(Object.values(COGNITO_GROUPS));
  return Array.from(
    new Set(
      stringValues(value).filter((group): group is CognitoGroup =>
        allowed.has(group as CognitoGroup)
      )
    )
  );
}

export function belongsToAnyCognitoGroup(
  groups: readonly CognitoGroup[],
  allowedGroups: readonly CognitoGroup[]
): boolean {
  return groups.some(group => allowedGroups.includes(group));
}

export function canManageCognitoUsers(
  groups: readonly CognitoGroup[]
): boolean {
  return groups.includes(COGNITO_GROUPS.superAdmin);
}
