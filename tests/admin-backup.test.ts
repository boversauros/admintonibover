import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDynamoDbBackup,
  backupFilename,
} from '../lib/aws/admin-api/backup';
import { BackupDownloadError, downloadBackupAsJson } from '../lib/api/backup';
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
  const result = await downloadBackupAsJson({
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

test('truncated and checksum-invalid AWS backups never reach the save callback', async t => {
  await t.test('truncated JSON', async () => {
    let saves = 0;
    await assert.rejects(
      downloadBackupAsJson({
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
      downloadBackupAsJson({
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
    downloadBackupAsJson({
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
    downloadBackupAsJson({
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
