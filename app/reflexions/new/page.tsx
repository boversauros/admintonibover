import { redirect } from 'next/navigation';

import { SupabaseNewReflexion } from '@/components/admin/SupabaseNewReflexion';
import { getAdminDataBackend } from '@/lib/config/adminBackend';

export default function NewReflexionPage() {
  if (getAdminDataBackend() === 'aws') {
    redirect('/');
  }

  return <SupabaseNewReflexion />;
}
