import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDynamoDbBackup,
  backupFilename,
} from '../lib/aws/admin-api/backup';
import {
  BACKUP_TABLE_ORDER,
  BackupDownloadError,
  downloadBackupAsJson,
  type Backup,
} from '../lib/api/backup';
import type { DynamoItem } from '../lib/aws/dynamodb/port';

const EXPORTED_AT = '2026-08-12T10:00:00.000Z';

function fixtureBackup() {
  const items: DynamoItem[] = [
    {
      PK: 'SYSTEM',
      SK: 'REVISION',
      entityType: 'DATA_REVISION',
      schemaVersion: 1,
      revision: 7,
      updatedAt: EXPORTED_AT,
    },
    {
      PK: 'POST#post-1',
      SK: 'POST#post-1',
      entityType: 'POST',
      schemaVersion: 1,
      id: 'post-1',
      version: 1,
    },
    {
      PK: 'POSTS',
      SK: 'ORDER#000000000001#DATE#2026-08-12#POST#post-1',
      entityType: 'POST_SUMMARY',
      schemaVersion: 1,
      id: 'post-1',
      version: 1,
    },
  ];
  return createDynamoDbBackup({
    items,
    pageCount: 2,
    exportedAt: EXPORTED_AT,
    environment: 'dev',
  });
}

function backupResponse(value: unknown): Response {
  const filename = backupFilename('dev', EXPORTED_AT);
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-correlation-id': 'backup-request',
    },
  });
}

test('AWS backup is validated before the browser save receives it', async () => {
  const backup = fixtureBackup();
  const saves: Array<{ json: string; filename: string }> = [];
  const result = await downloadBackupAsJson('aws', {
    fetchImplementation: async () => backupResponse(backup),
    save: (json, filename) => saves.push({ json, filename }),
  });

  assert.deepEqual(result, {
    filename: 'admintonibover-aws-backup-dev-2026-08-12T10-00-00Z.json',
    environment: 'dev',
    itemCount: 3,
  });
  assert.equal(saves.length, 1);
  assert.equal(saves[0].filename, result.filename);
  assert.deepEqual(JSON.parse(saves[0].json), backup);
});

test('Supabase rollback mode keeps the legacy backup path without an AWS request', async () => {
  const tables = {} as Backup['tables'];
  for (const table of BACKUP_TABLE_ORDER) tables[table] = [];
  tables.languages.push({ id: 'ca', code: 'ca' });
  const rowCounts = {} as Backup['manifest']['row_counts'];
  for (const table of BACKUP_TABLE_ORDER) {
    rowCounts[table] = tables[table].length;
  }
  const backup: Backup = {
    manifest: {
      version: 1,
      exported_at: EXPORTED_AT,
      source_project_url: 'https://ci.invalid',
      schema_migration: '012_add_length_constraints.sql',
      row_counts: rowCounts,
    },
    tables,
  };
  let awsRequests = 0;
  const saves: Array<{ json: string; filename: string }> = [];

  const result = await downloadBackupAsJson('supabase', {
    fetchImplementation: async () => {
      awsRequests += 1;
      return new Response();
    },
    exportSupabaseBackup: async () => backup,
    save: (json, filename) => saves.push({ json, filename }),
  });

  assert.equal(awsRequests, 0);
  assert.equal(result.environment, 'supabase');
  assert.equal(result.itemCount, 1);
  assert.match(result.filename, /^tonibover-backup-[0-9T-]+\.json$/);
  assert.deepEqual(JSON.parse(saves[0].json), backup);
});

test('truncated and checksum-invalid AWS backups never reach the save callback', async t => {
  await t.test('truncated JSON', async () => {
    let saves = 0;
    await assert.rejects(
      downloadBackupAsJson('aws', {
        fetchImplementation: async () =>
          new Response('{"schema":', {
            headers: {
              'content-type': 'application/json',
              'content-disposition':
                'attachment; filename="admintonibover-aws-backup-dev-2026-08-12T10-00-00Z.json"',
            },
          }),
        save: () => {
          saves += 1;
        },
      }),
      error =>
        error instanceof BackupDownloadError && error.code === 'INVALID_JSON'
    );
    assert.equal(saves, 0);
  });

  await t.test('checksum mismatch', async () => {
    const corrupted = structuredClone(fixtureBackup());
    corrupted.items[1].version = 99;
    let saves = 0;
    await assert.rejects(
      downloadBackupAsJson('aws', {
        fetchImplementation: async () => backupResponse(corrupted),
        save: () => {
          saves += 1;
        },
      }),
      error =>
        error instanceof BackupDownloadError && error.code === 'DIGEST_MISMATCH'
    );
    assert.equal(saves, 0);
  });
});

test('secret fields and signed URLs fail the downloadable archive contract', async () => {
  const contaminated = structuredClone(fixtureBackup());
  Object.assign(contaminated.items[1], {
    uploadUrl:
      'https://bucket.invalid/private?X-Amz-Signature=not-downloadable',
  });
  let saves = 0;
  await assert.rejects(
    downloadBackupAsJson('aws', {
      fetchImplementation: async () => backupResponse(contaminated),
      save: () => {
        saves += 1;
      },
    }),
    error =>
      error instanceof BackupDownloadError && error.code === 'SENSITIVE_VALUE'
  );
  assert.equal(saves, 0);
});

test('a mismatched environment filename is rejected before download', async () => {
  const backup = fixtureBackup();
  let saves = 0;
  await assert.rejects(
    downloadBackupAsJson('aws', {
      fetchImplementation: async () =>
        new Response(JSON.stringify(backup), {
          headers: {
            'content-type': 'application/json',
            'content-disposition':
              'attachment; filename="admintonibover-aws-backup-prod-wrong.json"',
          },
        }),
      save: () => {
        saves += 1;
      },
    }),
    error =>
      error instanceof BackupDownloadError && error.code === 'INVALID_FILENAME'
  );
  assert.equal(saves, 0);
});
