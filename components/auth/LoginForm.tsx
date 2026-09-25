'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button, Heading, Input, Text } from '@/components/ui';

type Mode = 'sign-in' | 'new-password' | 'forgot' | 'confirm';
type AuthReply = {
  error?: string;
  message?: string;
  returnTo?: string;
  status?: string;
};

const PASSWORD_HELP =
  'Com a mínim 14 caràcters, amb una majúscula, una minúscula, un número i un símbol.';

export function LoginForm() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const previousMode = useRef(mode);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (previousMode.current !== mode) {
      document.getElementById('auth-title')?.focus();
      previousMode.current = mode;
    }
  }, [mode]);

  function switchMode(next: Mode) {
    setError('');
    setMessage('');
    setMode(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const password = fields.get('password');
    const confirmation = fields.get('confirmation');
    if (
      (mode === 'new-password' || mode === 'confirm') &&
      password !== confirmation
    ) {
      setError('Les contrasenyes no coincideixen.');
      return;
    }

    const enteredEmail = String(fields.get('email') ?? email).trim();
    setEmail(enteredEmail);
    setError('');
    setBusy(true);

    const path: Record<Mode, string> = {
      'sign-in': '/auth/login',
      'new-password': '/auth/new-password',
      forgot: '/auth/forgot-password',
      confirm: '/auth/confirm-password',
    };
    const body =
      mode === 'new-password'
        ? { password }
        : mode === 'confirm'
          ? { email: enteredEmail, code: fields.get('code'), password }
          : mode === 'forgot'
            ? { email: enteredEmail }
            : {
                email: enteredEmail,
                password,
                returnTo: `${window.location.pathname}${window.location.search}`,
              };
    try {
      const response = await fetch(path[mode], {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as AuthReply;
      if (!response.ok) {
        setError(
          result.error ??
            'No s’ha pogut completar la sol·licitud. Torna-ho a provar.'
        );
        return;
      }
      form.reset();
      if (
        result.status === 'authenticated' &&
        result.returnTo?.startsWith('/')
      ) {
        window.location.assign(result.returnTo);
      } else if (result.status === 'new-password-required') {
        switchMode('new-password');
      } else if (mode === 'forgot') {
        switchMode('confirm');
        setMessage(
          result.message ??
            'Si aquest compte pot recuperar l’accés, s’ha enviat un codi.'
        );
      } else if (result.status === 'password-reset') {
        switchMode('sign-in');
        setMessage(
          'Contrasenya actualitzada. Inicia sessió amb la contrasenya nova.'
        );
      } else {
        setError('No s’ha pogut completar la sol·licitud. Torna-ho a provar.');
      }
    } catch {
      setError('No s’ha pogut completar la sol·licitud. Torna-ho a provar.');
    } finally {
      setBusy(false);
    }
  }

  const title = {
    'sign-in': 'Inicia sessió',
    'new-password': 'Tria una contrasenya nova',
    forgot: 'Recupera l’accés',
    confirm: 'Consulta el correu',
  }[mode];

  return (
    <section
      className="w-full max-w-md mx-auto animate-fade-in-up"
      aria-labelledby="auth-title"
    >
      <div className="mb-9 text-center">
        <Text
          variant="label"
          className="mb-4 block text-2xs uppercase tracking-widest text-subtle"
        >
          Toni Bover · espai privat
        </Text>
        <Heading
          as="h1"
          size="4xl"
          className="mb-3"
          id="auth-title"
          tabIndex={-1}
        >
          {title}
        </Heading>
        <Text variant="muted">
          {mode === 'sign-in' && 'Accedeix a l’espai editorial.'}
          {mode === 'new-password' &&
            'Per completar la invitació, estableix una contrasenya permanent.'}
          {mode === 'forgot' &&
            'Introdueix el correu electrònic del compte per rebre un codi de recuperació.'}
          {mode === 'confirm' &&
            'Introdueix el codi que has rebut per correu i tria una contrasenya nova.'}
        </Text>
      </div>

      <form key={mode} onSubmit={submit} className="space-y-5">
        {mode !== 'new-password' && (
          <Input
            id="auth-email"
            name="email"
            label="Correu electrònic"
            type="email"
            autoComplete="email"
            required
            maxLength={320}
            defaultValue={email}
            onChange={event => setEmail(event.target.value)}
            disabled={busy}
          />
        )}
        {mode === 'confirm' && (
          <Input
            id="auth-code"
            name="code"
            label="Codi de confirmació"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={64}
            disabled={busy}
          />
        )}
        {(mode === 'sign-in' ||
          mode === 'new-password' ||
          mode === 'confirm') && (
          <Input
            id="auth-password"
            name="password"
            label={mode === 'sign-in' ? 'Contrasenya' : 'Contrasenya nova'}
            type="password"
            autoComplete={
              mode === 'sign-in' ? 'current-password' : 'new-password'
            }
            required
            maxLength={1024}
            minLength={mode === 'sign-in' ? undefined : 14}
            aria-describedby={mode === 'sign-in' ? undefined : 'password-help'}
            disabled={busy}
          />
        )}
        {(mode === 'new-password' || mode === 'confirm') && (
          <>
            <p id="password-help" className="text-sm text-muted">
              {PASSWORD_HELP}
            </p>
            <Input
              id="auth-confirmation"
              name="confirmation"
              label="Confirma la contrasenya nova"
              type="password"
              autoComplete="new-password"
              required
              disabled={busy}
            />
          </>
        )}
        {error && (
          <p
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="text-sm text-danger"
          >
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-body">
            {message}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          size="lg"
          loading={busy}
        >
          {
            {
              'sign-in': 'Inicia sessió',
              'new-password': 'Desa la contrasenya',
              forgot: 'Envia el codi de recuperació',
              confirm: 'Restableix la contrasenya',
            }[mode]
          }
        </Button>
      </form>

      <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
        {mode === 'sign-in' ? (
          <button
            type="button"
            onClick={() => switchMode('forgot')}
            className="text-muted underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Has oblidat la contrasenya?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => switchMode('sign-in')}
            className="text-muted underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Torna a l’inici de sessió
          </button>
        )}
      </div>
    </section>
  );
}
