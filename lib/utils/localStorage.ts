import { StoredPost, Language } from '../types/post';

const POSTS_KEY = 'posts';

export function getPosts(): StoredPost[] {
  if (typeof window === 'undefined') return [];

  const data = localStorage.getItem(POSTS_KEY);
  return data ? JSON.parse(data) : [];
}

export function savePosts(posts: StoredPost[]): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  } catch (error: any) {
    if (error.name === 'QuotaExceededError') {
      throw new Error('Storage quota exceeded');
    }
    throw error;
  }
}

export function generatePostId(): string {
  return `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function getExistingSlugs(language: Language): string[] {
  return getPosts().map(p => p.translations[language].slug);
}
