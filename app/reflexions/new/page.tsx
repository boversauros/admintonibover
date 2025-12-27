'use client';

import { PostForm } from '@/components/forms/PostForm';

export default function NewReflexionPage() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">New Reflexion</h1>
          <p className="text-muted">Create a new bilingual post with Catalan and English translations</p>
        </div>

        <PostForm />
      </div>
    </div>
  );
}
