import { supabase } from '../supabase';
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
        const message =
          err instanceof Error ? err.message : String(err);
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

  const sourceUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'unknown';

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

function backupFilename(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  return `tonibover-backup-${stamp}.json`;
}

/**
 * Builds a full backup and triggers a browser download.
 */
export async function downloadBackupAsJson(): Promise<void> {
  const backup = await exportFullBackup();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = backupFilename();
  anchor.click();

  URL.revokeObjectURL(url);
}
