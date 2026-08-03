'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { LoginForm } from '@/components/auth/LoginForm';
import { AwsReadTracer } from '@/components/migration/AwsReadTracer';

export function AwsTracerHome() {
  return (
    <AuthGuard
      fallback={
        <div className="flex min-h-screen items-center justify-center p-8">
          <LoginForm />
        </div>
      }
    >
      <AwsReadTracer />
    </AuthGuard>
  );
}
