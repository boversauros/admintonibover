import { redirect } from 'next/navigation';

import { SupabaseEditReflexion } from '@/components/admin/SupabaseEditReflexion';
import { getAdminDataBackend } from '@/lib/config/adminBackend';

export default function EditReflexionPage() {
  if (getAdminDataBackend() === 'aws') {
    redirect('/');
  }

  return <SupabaseEditReflexion />;
}
