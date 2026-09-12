import {
  backupFilename as awsBackupFilename,
  isDynamoDbBackupV2,
  validateDynamoDbBackupDocument,
  type BackupEnvironment,
  type DynamoDbBackupV2,
} from '../aws/backup-contract';
import { redirectIfSessionExpired } from '../auth/client-session';

export type BackupDownloadResult = {
  filename: string;
  environment: BackupEnvironment;
  itemCount: number;
};

type BackupDownloadDependencies = {
  fetchImplementation?: typeof fetch;
  save?: (json: string, filename: string) => void;
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

/** Builds, validates, and triggers an AWS backup download. */
export async function downloadBackupAsJson(
  dependencies: BackupDownloadDependencies = {}
): Promise<BackupDownloadResult> {
  const save = dependencies.save ?? saveJsonDownload;
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
