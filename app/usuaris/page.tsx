import type { Metadata } from 'next';
import { UsersAdmin } from '@/components/admin/UsersAdmin';

export const metadata: Metadata = { title: 'Usuaris · Toni Bover' };

export default function UsersPage() {
  return <UsersAdmin />;
}
