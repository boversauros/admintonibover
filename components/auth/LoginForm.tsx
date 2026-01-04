'use client';

import { useState } from 'react';
import { Input, Button, Text, Heading } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthContext';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setHasError(false);
    setLoading(true);

    try {
      await signIn(email, password);
      // AuthContext will handle navigation via state change
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
      setHasError(true);
      setLoading(false);
      // Reset shake animation after it completes
      setTimeout(() => setHasError(false), 500);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto animate-fade-in-up">
      <div className="mb-8 text-center">
        <Heading as="h1" size="4xl" className="mb-2">
          Admin Login
        </Heading>
        <Text variant="muted">Sign in to manage your reflexions</Text>
      </div>

      <form
        onSubmit={handleSubmit}
        className={`space-y-6 ${hasError ? 'animate-shake' : ''}`}
      >
        {error && (
          <div className="p-4 border border-red-500/30 bg-red-500/10 animate-fade-in">
            <Text className="text-red-400 text-sm">{error}</Text>
          </div>
        )}

        <Input
          id="email"
          type="email"
          label="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          disabled={loading}
          autoComplete="email"
          placeholder="your@email.com"
        />

        <Input
          id="password"
          type="password"
          label="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          disabled={loading}
          autoComplete="current-password"
          placeholder="Enter your password"
        />

        <Button type="submit" variant="primary" fullWidth loading={loading}>
          Sign In
        </Button>
      </form>
    </div>
  );
}
