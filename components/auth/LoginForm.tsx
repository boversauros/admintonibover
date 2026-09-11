'use client';

import { Button, Text, Heading } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthContext';

export function LoginForm() {
  const { signIn } = useAuth();

  return (
    <div className="w-full max-w-md mx-auto animate-fade-in-up">
      <div className="mb-8 text-center">
        <Text
          variant="label"
          className="mb-4 block text-2xs uppercase tracking-[0.28em] text-subtle"
        >
          AWS · secure access
        </Text>
        <Heading as="h1" size="4xl" className="mb-3">
          Admin Login
        </Heading>
        <Text variant="muted">
          Continue to the private Cognito sign-in. Registration is disabled.
        </Text>
      </div>

      <Button
        type="button"
        variant="primary"
        fullWidth
        size="lg"
        onClick={signIn}
      >
        Continue to secure sign-in
      </Button>

      <Text variant="small" className="mt-5 block text-center text-subtle">
        Email and password · no application MFA challenge
      </Text>
    </div>
  );
}
