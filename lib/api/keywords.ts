import { supabase } from '../supabase';
import { Language } from '../types/post';

export interface KeywordsByLanguage {
  ca: string[];
  en: string[];
}

/**
 * Fetch all unique keywords from the database, grouped by language
 */
export async function getKeywords(): Promise<KeywordsByLanguage> {
  const { data, error } = await supabase
    .from('keywords')
    .select('keyword, language_id')
    .order('keyword');

  if (error) {
    console.error('Error fetching keywords:', error);
    throw error;
  }

  const grouped: KeywordsByLanguage = {
    ca: [],
    en: [],
  };

  data?.forEach(row => {
    if (row.language_id === 1) {
      grouped.ca.push(row.keyword);
    } else if (row.language_id === 2) {
      grouped.en.push(row.keyword);
    }
  });

  return grouped;
}

/**
 * Fetch keywords for a specific language
 */
export async function getKeywordsByLanguage(
  language: Language
): Promise<string[]> {
  const languageId = language === 'ca' ? 1 : 2;

  const { data, error } = await supabase
    .from('keywords')
    .select('keyword')
    .eq('language_id', languageId)
    .order('keyword');

  if (error) {
    console.error('Error fetching keywords:', error);
    throw error;
  }

  return data?.map(row => row.keyword) || [];
}
