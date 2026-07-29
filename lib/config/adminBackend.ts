export const ADMIN_DATA_BACKENDS = ['supabase', 'aws'] as const;

export type AdminDataBackend = (typeof ADMIN_DATA_BACKENDS)[number];

export function parseAdminDataBackend(
  value: string | undefined
): AdminDataBackend {
  if (value === undefined || value === '' || value === 'supabase') {
    return 'supabase';
  }

  if (value === 'aws') {
    return 'aws';
  }

  throw new Error(
    `ADMIN_DATA_BACKEND must be one of: ${ADMIN_DATA_BACKENDS.join(', ')}`
  );
}

export function getAdminDataBackend(): AdminDataBackend {
  return parseAdminDataBackend(process.env.ADMIN_DATA_BACKEND);
}
