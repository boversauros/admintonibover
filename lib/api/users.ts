import type { ManagedUser, UserAction } from '@/lib/aws/admin-api/users';

export class UserApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'UserApiError';
  }
}

function fallbackMessage(status: number): string {
  if (status === 404) {
    return 'La ruta d’usuaris encara no existeix a l’API d’AWS configurada (HTTP 404). Cal desplegar la infraestructura de la incidència 52.';
  }
  if (status === 401) return 'La sessió ha caducat. Torna a iniciar sessió.';
  if (status === 403) return 'No tens permís per gestionar usuaris.';
  return `No s’ha pogut completar la petició (HTTP ${status}).`;
}

async function request<T>(
  path: string,
  body?: Record<string, string>
): Promise<T> {
  const response = await fetch(`/api/aws/${path}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new UserApiError(fallbackMessage(response.status), response.status);
  }
  if (!payload || typeof payload !== 'object') {
    throw new UserApiError(fallbackMessage(response.status), response.status);
  }
  const envelope = payload as { data?: T; error?: { message?: string } };
  if (!response.ok || !envelope.data) {
    throw new UserApiError(
      envelope.error?.message ?? fallbackMessage(response.status),
      response.status
    );
  }
  return envelope.data;
}

export function listUsers(cursor?: string) {
  const path = cursor ? `users?${new URLSearchParams({ cursor })}` : 'users';
  return request<{ items: ManagedUser[]; nextCursor: string | null }>(path);
}

export function inviteEditor(email: string) {
  return request<{ user: ManagedUser }>('users', { email });
}

export function manageUser(username: string, action: UserAction) {
  return request<{ completed: true }>(
    `users/${encodeURIComponent(username)}/actions`,
    { action }
  );
}
