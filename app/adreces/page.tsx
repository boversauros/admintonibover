import type { Metadata } from 'next';
import { LegacySlugsAdmin } from '@/components/admin/LegacySlugsAdmin';

export const metadata: Metadata = { title: 'Adreces antigues · Toni Bover' };

export default function LegacySlugsPage() {
  return <LegacySlugsAdmin />;
}
