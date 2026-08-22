import assert from 'node:assert/strict';
import test from 'node:test';

test('importing the Supabase browser client is inert until the Supabase branch uses it', async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalFetch = globalThis.fetch;
  let requests = 0;

  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error('Supabase must not be contacted during module import');
  };

  try {
    const { createClient } = await import('../lib/supabase/client');
    assert.equal(requests, 0);
    assert.throws(
      () => createClient(),
      /Missing Supabase environment variables/
    );
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    }
    if (previousKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
    }
  }
});
