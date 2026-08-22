import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '../types/database';

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let browserClient: SupabaseBrowserClient | undefined;

/**
 * Creates the Supabase browser client only when the Supabase backend is used.
 * Importing this module in AWS mode must not start Supabase Auth auto-refresh.
 */
export function createClient(): SupabaseBrowserClient {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Please check your .env.local file.'
    );
  }

  browserClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  return browserClient;
}
