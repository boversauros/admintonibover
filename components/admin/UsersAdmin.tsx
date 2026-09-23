'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { canManageCognitoUsers } from '@/lib/auth/cognito/groups';
import type { ManagedUser, UserAction } from '@/lib/aws/admin-api/users';
import { inviteEditor, listUsers, manageUser } from '@/lib/api/users';
import { Button, Heading, Icon, Input, Text } from '@/components/ui';
import { UserMenu } from '@/components/auth/UserMenu';

const actionLabels: Record<UserAction, string> = {
  'resend-invitation': 'Reenviar invitació',
  'reset-password': 'Demanar canvi de contrasenya',
  enable: 'Activar compte',
  disable: 'Desactivar compte',
  'revoke-sessions': 'Revocar sessions',
};

function statusLabel(user: ManagedUser): string {
  if (!user.enabled) return 'Desactivat';
  if (user.status === 'FORCE_CHANGE_PASSWORD') return 'Invitació pendent';
  if (user.status === 'RESET_REQUIRED') return 'Canvi de contrasenya pendent';
  if (user.status === 'CONFIRMED') return 'Actiu';
  return 'Estat desconegut';
}

function roleLabel(user: ManagedUser): string {
  if (user.groups.includes('super-admins')) return 'Superadministrador';
  if (user.groups.includes('editors')) return 'Editor';
  return 'Sense rol';
}

export function UsersAdmin() {
  const { user, signOut } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);
  const allowed = Boolean(user && canManageCognitoUsers(user.groups));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const page = await listUsers();
      setUsers(page.items);
      setCursor(page.nextCursor);
      setLoadFailed(false);
    } catch (error) {
      setLoadFailed(true);
      setMessage({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'No s’han pogut carregar els usuaris.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void listUsers()
      .then(page => {
        if (!active) return;
        setUsers(page.items);
        setCursor(page.nextCursor);
        setLoadFailed(false);
      })
      .catch(error => {
        if (!active) return;
        setLoadFailed(true);
        setMessage({
          kind: 'error',
          text:
            error instanceof Error
              ? error.message
              : 'No s’han pogut carregar els usuaris.',
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [allowed]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy('invite');
    setMessage(null);
    try {
      await inviteEditor(email.trim());
      setEmail('');
      setMessage({
        kind: 'success',
        text: 'Invitació enviada. La persona rebrà un correu amb una contrasenya temporal.',
      });
      await refresh();
    } catch (error) {
      setMessage({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'No s’ha pogut enviar la invitació.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function act(target: ManagedUser, action: UserAction) {
    if (busy) return;
    if (
      (action === 'disable' ||
        action === 'revoke-sessions' ||
        action === 'reset-password') &&
      !window.confirm(`${actionLabels[action]} per a ${target.email}?`)
    )
      return;
    setBusy(target.username);
    setMessage(null);
    try {
      await manageUser(target.username, action);
      setMessage({
        kind: 'success',
        text: `${actionLabels[action]}: operació completada.`,
      });
      await refresh();
    } catch (error) {
      setMessage({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'No s’ha pogut completar l’operació.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy('more');
    try {
      const page = await listUsers(cursor);
      setUsers(current => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      setMessage({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'No s’han pogut carregar més usuaris.',
      });
    } finally {
      setBusy(null);
    }
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <Heading as="h1" size="xl">
          Inicia sessió
        </Heading>
        <Link href="/" className="text-primary underline">
          Torna a l’inici
        </Link>
      </main>
    );
  }
  if (!allowed) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <Heading as="h1" size="xl">
          Accés restringit
        </Heading>
        <p className="mt-4 text-muted">
          Només els superadministradors poden gestionar usuaris.
        </p>
        <Link href="/" className="mt-6 inline-block text-primary underline">
          Torna als articles
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-primary">
      <header className="border-b border-default bg-nav">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="font-serif text-xl text-primary hover:opacity-80"
          >
            Toni Bover
          </Link>
          <UserMenu user={user} onLogout={signOut} />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Link
          href="/"
          className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-primary"
        >
          <Icon name="arrow-left" /> Articles
        </Link>
        <div className="mb-10 border-b border-default pb-8">
          <Text
            variant="small"
            className="mb-3 uppercase tracking-widest text-muted"
          >
            Administració
          </Text>
          <Heading as="h1" size="xl" className="font-serif">
            Usuaris
          </Heading>
          <p className="mt-3 max-w-2xl text-body">
            Convida editors i gestiona els comptes amb accés al blog.
          </p>
        </div>

        <section
          aria-labelledby="invite-title"
          className="mb-10 border border-default bg-surface p-6 sm:p-8"
        >
          <Heading as="h2" size="2xl" className="font-serif" id="invite-title">
            Convidar un editor
          </Heading>
          <p className="mt-2 text-sm text-muted">
            La invitació caduca al cap de tres dies. L’editor haurà de triar una
            contrasenya nova.
          </p>
          <form
            onSubmit={invite}
            className="mt-6 flex flex-col items-end gap-4 sm:flex-row"
          >
            <Input
              id="invite-email"
              label="Correu electrònic"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="nom@exemple.cat"
            />
            <Button
              type="submit"
              disabled={loading || loadFailed || Boolean(busy)}
              loading={busy === 'invite'}
              className="w-full shrink-0 sm:w-auto"
            >
              Enviar invitació
            </Button>
          </form>
        </section>

        {message && (
          <div
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={`mb-6 border px-4 py-3 text-sm ${message.kind === 'error' ? 'border-red-500/40 text-red-300' : 'border-emerald-500/40 text-emerald-300'}`}
          >
            {message.text}
          </div>
        )}

        <section aria-labelledby="current-users-title">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <Heading
                as="h2"
                size="2xl"
                className="font-serif"
                id="current-users-title"
              >
                Usuaris actuals
              </Heading>
              <p className="mt-1 text-sm text-muted">
                {users.length} comptes carregats
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading || Boolean(busy)}
            >
              Actualitzar
            </Button>
          </div>
          {loading ? (
            <p role="status" className="py-8 text-muted">
              Carregant usuaris…
            </p>
          ) : loadFailed ? (
            <p className="border border-default p-6 text-muted">
              No s’ha pogut carregar la llista. Torna-ho a provar amb el botó
              «Actualitzar».
            </p>
          ) : users.length === 0 ? (
            <p className="border border-default p-6 text-muted">
              Encara no hi ha cap usuari.
            </p>
          ) : (
            <ul className="divide-y divide-default border-y border-default">
              {users.map(target => (
                <li
                  key={target.username}
                  className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <p className="break-all font-medium text-primary">
                      {target.email || target.username}
                      {target.subject === user.id ? ' (tu)' : ''}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {roleLabel(target)} · {statusLabel(target)}
                      {!target.emailVerified ? ' · Correu no verificat' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {target.groups.includes('editors') &&
                      target.status === 'FORCE_CHANGE_PASSWORD' &&
                      target.enabled && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={Boolean(busy)}
                          onClick={() => void act(target, 'resend-invitation')}
                        >
                          Reenviar invitació
                        </Button>
                      )}
                    {target.enabled &&
                      target.status !== 'FORCE_CHANGE_PASSWORD' &&
                      target.emailVerified && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={Boolean(busy)}
                          onClick={() => void act(target, 'reset-password')}
                        >
                          Restablir contrasenya
                        </Button>
                      )}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(busy)}
                      onClick={() => void act(target, 'revoke-sessions')}
                    >
                      Revocar sessions
                    </Button>
                    {target.enabled ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={Boolean(busy) || target.subject === user.id}
                        onClick={() => void act(target, 'disable')}
                      >
                        Desactivar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={Boolean(busy)}
                        onClick={() => void act(target, 'enable')}
                      >
                        Activar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {cursor && (
            <Button
              variant="secondary"
              className="mt-6"
              disabled={Boolean(busy)}
              onClick={() => void loadMore()}
            >
              Carregar més usuaris
            </Button>
          )}
        </section>
      </div>
    </main>
  );
}
