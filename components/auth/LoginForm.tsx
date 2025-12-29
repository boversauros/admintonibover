'use client';

import { useState } from 'react';
import { Input, Button, Text, Heading } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthContext';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
      // AuthContext will handle navigation via state change
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8 text-center">
        <Heading as="h1" size="4xl" className="mb-2">
          Admin Login
        </Heading>
        <Text variant="muted">Sign in to manage your reflexions</Text>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 border border-red-200 bg-red-50 rounded-md">
            <Text className="text-red-800 text-sm">{error}</Text>
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-2">
            Email
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            autoComplete="email"
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-2">
            Password
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            autoComplete="current-password"
            placeholder="Enter your password"
          />
        </div>

        <Button type="submit" variant="primary" fullWidth loading={loading}>
          Sign In
        </Button>
      </form>
    </div>
  );
}
