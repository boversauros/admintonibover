import { backupFilename, createDynamoDbBackup } from '../backup';
import type { RouteHandler } from '../context';

// The download is a raw backup document, not the versioned API envelope.
const downloadBackup: RouteHandler = async ({
  dependencies,
  requestId,
  clock,
  logger,
}) => {
  const scanned = await dependencies.store.scanAll();
  const backup = createDynamoDbBackup({
    ...scanned,
    exportedAt: clock().toISOString(),
    environment: dependencies.environment,
  });
  logger.info({
    message: 'admin_backup_created',
    requestId,
    itemCount: backup.manifest.itemCount,
    pageCount: backup.manifest.pageCount,
  });
  return {
    statusCode: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="${backupFilename(
        backup.environment,
        backup.exportedAt
      )}"`,
      'x-correlation-id': requestId,
    },
    body: JSON.stringify(backup),
  };
};

export const backupRoutes = {
  'GET /backup': downloadBackup,
} satisfies Record<string, RouteHandler>;
