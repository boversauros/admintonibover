'use client';

export function redirectIfSessionExpired(response: Response): void {
  if (response.status === 401) {
    window.location.replace('/?auth=expired');
    throw new Error('Your session expired. Sign in again.');
  }
}
