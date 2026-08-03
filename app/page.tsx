import { SupabaseAdmin } from '@/components/admin/SupabaseAdmin';
import { AwsTracerHome } from '@/components/migration/AwsTracerHome';
import { getAdminDataBackend } from '@/lib/config/adminBackend';

export default function Home() {
  return getAdminDataBackend() === 'aws' ? (
    <AwsTracerHome />
  ) : (
    <SupabaseAdmin />
  );
}
