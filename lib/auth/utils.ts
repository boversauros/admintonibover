import { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';

/**
 * Get current authenticated user
 * Returns null if not authenticated
 */
export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null;
}

/**
 * Get user ID for database operations
 * Returns null if not authenticated
 */
export async function getUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id || null;
}
