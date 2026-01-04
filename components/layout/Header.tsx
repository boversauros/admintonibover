'use client';

import { useAuth } from '@/lib/auth/AuthContext';
import { Button, Text } from '@/components/ui';
import { useRouter } from 'next/navigation';

export function Header() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (!user) return null;

  return (
    <header className="border-b border-subtle">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <div>
          <Text className="font-serif text-xl">Toni Bover Admin</Text>
        </div>
        <div className="flex items-center gap-4">
          <Text variant="muted" className="text-sm">
            {user.email}
          </Text>
          <Button onClick={handleLogout} variant="ghost" size="sm">
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
