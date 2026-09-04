import {
  backupFilename as awsBackupFilename,
  isDynamoDbBackupV2,
  validateDynamoDbBackupDocument,
  type BackupEnvironment,
  type DynamoDbBackupV2,
} from '../aws/backup-contract';
import { redirectIfSessionExpired } from '../auth/client-session';
import type { AdminDataBackend } from '../config/adminBackend';
import type { Database } from '../types/database';

const PAGE_SIZE = 1000;

/** Insertion-safe FK order for restore scripts */
export const BACKUP_TABLE_ORDER = [
  'languages',
  'categories',
  'category_translations',
  'images',
  'posts',
  'post_translations',
  'keywords',
  'post_keywords',
  'post_references',
] as const;

export type BackupTableName = (typeof BACKUP_TABLE_ORDER)[number];

const LATEST_SCHEMA_MIGRATION = '012_add_length_constraints.sql';

export type BackupManifest = {
  version: 1;
  exported_at: string;
  source_project_url: string;
  schema_migration: string;
  row_counts: Record<BackupTableName, number>;
};

export type Backup = {
  manifest: BackupManifest;
  tables: Record<BackupTableName, Record<string, unknown>[]>;
};

type PublicTableName = keyof Database['public']['Tables'];

async function fetchAllRows(
  table: PublicTableName
): Promise<Record<string, unknown>[]> {
  const { createClient } = await import('../supabase');
  const supabase = createClient();
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, to);

    if (error) throw error;

    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/**
 * Exports every public table as raw rows (insertion-safe FK order in manifest).
 */
export async function exportFullBackup(): Promise<Backup> {
  const failures: string[] = [];
  const tables = {} as Record<BackupTableName, Record<string, unknown>[]>;
  const row_counts = {} as Record<BackupTableName, number>;

  await Promise.all(
    BACKUP_TABLE_ORDER.map(async tableName => {
      try {
        const rows = await fetchAllRows(tableName);
        tables[tableName] = rows;
        row_counts[tableName] = rows.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${tableName}: ${message}`);
        tables[tableName] = [];
        row_counts[tableName] = 0;
      }
    })
  );

  if (failures.length > 0) {
    throw new Error(
      `Backup failed for ${failures.length} table(s):\n${failures.join('\n')}`
    );
  }

  const sourceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'unknown';

  return {
    manifest: {
      version: 1,
      exported_at: new Date().toISOString(),
      source_project_url: sourceUrl,
      schema_migration: LATEST_SCHEMA_MIGRATION,
      row_counts,
    },
    tables,
  };
}

function supabaseBackupFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `tonibover-backup-${stamp}.json`;
}

export type BackupDownloadResult = {
  filename: string;
  environment: BackupEnvironment | 'supabase';
  itemCount: number;
};

type BackupDownloadDependencies = {
  fetchImplementation?: typeof fetch;
  save?: (json: string, filename: string) => void;
  exportSupabaseBackup?: () => Promise<Backup>;
};

export class BackupDownloadError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly requestId?: string
  ) {
    super(message);
    this.name = 'BackupDownloadError';
  }
}

function saveJsonDownload(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function errorMessage(status: number): string {
  if (status === 401) return 'La sessió ha caducat. Torna a iniciar sessió.';
  if (status === 403) return 'No tens permisos per descarregar la còpia.';
  if (status === 409) {
    return 'Les dades han canviat durant l’exportació. Torna-ho a provar.';
  }
  if (status === 413) return 'La còpia és massa gran per descarregar-la.';
  if (status === 429) {
    return 'S’han fet massa sol·licituds. Espera un moment i torna-ho a provar.';
  }
  return 'No s’ha pogut generar la còpia de seguretat d’AWS.';
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function responseRequestId(response: Response): string | undefined {
  return response.headers.get('x-correlation-id')?.trim() || undefined;
}

export async function prepareAwsBackupDownload(
  fetchImplementation: typeof fetch = fetch
): Promise<{ backup: DynamoDbBackupV2; filename: string; json: string }> {
  let response: Response;
  try {
    response = await fetchImplementation('/api/aws/backup', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new BackupDownloadError(
      'No s’ha pogut contactar amb el servei de còpies.',
      'BACKUP_UNAVAILABLE'
    );
  }
  const requestId = responseRequestId(response);
  if (!response.ok) {
    if (response.status === 401) redirectIfSessionExpired(response);
    throw new BackupDownloadError(
      errorMessage(response.status),
      `HTTP_${response.status}`,
      requestId
    );
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new BackupDownloadError(
      'La resposta de la còpia no és un document JSON.',
      'INVALID_CONTENT_TYPE',
      requestId
    );
  }

  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new BackupDownloadError(
      'La còpia rebuda està truncada o no és JSON vàlid.',
      'INVALID_JSON',
      requestId
    );
  }
  const shapeIssues = validateDynamoDbBackupDocument(parsed);
  if (shapeIssues.length > 0 || !isDynamoDbBackupV2(parsed)) {
    throw new BackupDownloadError(
      `La còpia rebuda no és vàlida (${shapeIssues[0]?.code ?? 'INVALID_BACKUP'}).`,
      shapeIssues[0]?.code ?? 'INVALID_BACKUP',
      requestId
    );
  }
  const computedSha256 = await sha256(JSON.stringify(parsed.items));
  const integrityIssues = validateDynamoDbBackupDocument(
    parsed,
    computedSha256
  );
  if (integrityIssues.length > 0) {
    throw new BackupDownloadError(
      `La integritat de la còpia no és vàlida (${integrityIssues[0].code}).`,
      integrityIssues[0].code,
      requestId
    );
  }
  const filename = awsBackupFilename(parsed.environment, parsed.exportedAt);
  if (
    response.headers.get('content-disposition') !==
    `attachment; filename="${filename}"`
  ) {
    throw new BackupDownloadError(
      'El nom de fitxer retornat pel servei no és vàlid.',
      'INVALID_FILENAME',
      requestId
    );
  }
  return {
    backup: parsed,
    filename,
    json: JSON.stringify(parsed, null, 2),
  };
}

/** Builds, validates, and triggers the selected backend backup download. */
export async function downloadBackupAsJson(
  backend: AdminDataBackend,
  dependencies: BackupDownloadDependencies = {}
): Promise<BackupDownloadResult> {
  const save = dependencies.save ?? saveJsonDownload;
  if (backend === 'supabase') {
    const backup = await (
      dependencies.exportSupabaseBackup ?? exportFullBackup
    )();
    const filename = supabaseBackupFilename();
    save(JSON.stringify(backup, null, 2), filename);
    return {
      filename,
      environment: 'supabase',
      itemCount: Object.values(backup.manifest.row_counts).reduce(
        (total, count) => total + count,
        0
      ),
    };
  }

  const prepared = await prepareAwsBackupDownload(
    dependencies.fetchImplementation
  );
  save(prepared.json, prepared.filename);
  return {
    filename: prepared.filename,
    environment: prepared.backup.environment,
    itemCount: prepared.backup.manifest.itemCount,
  };
}
