'use client';

import { Link } from '@/components/ui';

export default function Home() {
  return (
    <div className="min-h-screen p-8">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Reflexions MVP</h1>

        <section className="mb-8">
          <div className="border border-accent p-6 rounded bg-surface">
            <h2 className="text-2xl font-semibold mb-4">✅ MVP Ready!</h2>
            <p className="text-muted mb-4">
              The bilingual post creation form is ready to use. Create new reflexions with support for both Catalan and English content.
            </p>
            <Link href="/reflexions/new" variant="accent-border">
              Go to /reflexions/new →
            </Link>
          </div>
        </section>

        <section>
          <div className="border border-default p-6 rounded">
            <h2 className="text-xl font-semibold mb-4">Implementation Status</h2>
            <ul className="space-y-2 text-muted">
              <li>✅ Phase 1: Foundation (Types, Utils, Validation)</li>
              <li>✅ Phase 2: Base Components (DatePicker, KeywordsInput, etc.)</li>
              <li>✅ Phase 3: Form Sections (PostMetadata, Translation, etc.)</li>
              <li>✅ Phase 4: Main PostForm Component</li>
              <li>✅ Phase 5: /reflexions/new Route</li>
              <li>✅ Phase 6: Edge Cases & Polish</li>
            </ul>

            <div className="mt-6 pt-6 border-t border-default">
              <h3 className="text-lg font-medium mb-2">Features</h3>
              <ul className="space-y-1 text-sm text-muted">
                <li>• Bilingual content (CA/EN) with language tabs</li>
                <li>• Auto-generated slugs from titles (editable)</li>
                <li>• Keywords management with duplicate prevention</li>
                <li>• Dynamic references with citations and blockquotes</li>
                <li>• Image thumbnail support (URL-based)</li>
                <li>• LocalStorage persistence</li>
                <li>• Form validation with instant feedback</li>
                <li>• Unique slug verification</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
