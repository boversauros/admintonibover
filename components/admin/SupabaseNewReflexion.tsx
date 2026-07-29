'use client';

import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { PostForm } from '@/components/forms/PostForm';

function NewReflexionContent() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/');
  };

  return <PostForm onSuccess={handleSuccess} />;
}

export function SupabaseNewReflexion() {
  return (
    <AuthGuard fallback={null}>
      <NewReflexionContent />
    </AuthGuard>
  );
}
