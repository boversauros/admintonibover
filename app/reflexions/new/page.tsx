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

export default function NewReflexionPage() {
  return (
    <AuthGuard fallback={null}>
      <NewReflexionContent />
    </AuthGuard>
  );
}
