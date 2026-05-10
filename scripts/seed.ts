import { createClient, SupabaseClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'
  );
  process.exit(1);
}

const SEED_AUTHOR = 'SEED';

const LANGUAGE_IDS = { ca: 1, en: 2 } as const;

type Lang = 'ca' | 'en';

type TranslationFixture = {
  title: string;
  content: string;
  slug: string;
  keywords: string[];
};

type PostFixture = {
  categorySlug: 'vivencies' | 'influencies' | 'perspectives';
  ca: TranslationFixture;
  en: TranslationFixture;
};

const FIXTURES: PostFixture[] = [
  {
    categorySlug: 'vivencies',
    ca: {
      title: 'Records de la infància a Mallorca',
      content:
        'Els estius a la costa van marcar la meva manera de mirar el món. Aquell gust de sal i el so de les onades encara em ressonen.',
      slug: 'seed-vivencies-1-ca',
      keywords: ['infància', 'mallorca'],
    },
    en: {
      title: 'Childhood memories in Mallorca',
      content:
        'Summers on the coast shaped how I see the world. The taste of salt and the sound of waves still echo within me.',
      slug: 'seed-vivencies-1-en',
      keywords: ['childhood', 'mallorca'],
    },
  },
  {
    categorySlug: 'vivencies',
    ca: {
      title: 'El primer viatge en solitari',
      content:
        'Vaig descobrir que la solitud no és absència sinó companyia interior. Cada pas em va acostar a mi mateix.',
      slug: 'seed-vivencies-2-ca',
      keywords: ['viatge', 'introspecció'],
    },
    en: {
      title: 'The first solo trip',
      content:
        'I learned that solitude is not absence but inner company. Every step brought me closer to myself.',
      slug: 'seed-vivencies-2-en',
      keywords: ['travel', 'introspection'],
    },
  },
  {
    categorySlug: 'influencies',
    ca: {
      title: 'Llegint Llull amb ulls nous',
      content:
        'Ramon Llull em va ensenyar que la raó i la passió no són enemics. La seva escriptura és pont entre mons.',
      slug: 'seed-influencies-1-ca',
      keywords: ['llull', 'filosofia'],
    },
    en: {
      title: 'Reading Llull with new eyes',
      content:
        'Ramon Llull taught me that reason and passion are not enemies. His writing is a bridge between worlds.',
      slug: 'seed-influencies-1-en',
      keywords: ['llull', 'philosophy'],
    },
  },
  {
    categorySlug: 'influencies',
    ca: {
      title: 'La música de Maria del Mar Bonet',
      content:
        'La seva veu carrega segles de Mediterrània. Cada cançó és un mapa cap a la nostra memòria col·lectiva.',
      slug: 'seed-influencies-2-ca',
      keywords: ['música', 'mediterrània'],
    },
    en: {
      title: 'The music of Maria del Mar Bonet',
      content:
        'Her voice carries centuries of Mediterranean. Each song is a map toward our collective memory.',
      slug: 'seed-influencies-2-en',
      keywords: ['music', 'mediterranean'],
    },
  },
  {
    categorySlug: 'perspectives',
    ca: {
      title: 'Sobre el temps lent',
      content:
        'Vivim accelerats i oblidem el valor de la pausa. La lentitud és una forma de resistència contemporània.',
      slug: 'seed-perspectives-1-ca',
      keywords: ['lentitud', 'reflexió'],
    },
    en: {
      title: 'On slow time',
      content:
        'We live accelerated and forget the value of pausing. Slowness is a form of contemporary resistance.',
      slug: 'seed-perspectives-1-en',
      keywords: ['slowness', 'reflection'],
    },
  },
  {
    categorySlug: 'perspectives',
    ca: {
      title: 'Què significa pertànyer',
      content:
        'Pertànyer no és quedar-se quiet sinó arrelar-se mentre un creix. La identitat és un riu, no una pedra.',
      slug: 'seed-perspectives-2-ca',
      keywords: ['identitat', 'arrels'],
    },
    en: {
      title: 'What it means to belong',
      content:
        'Belonging is not standing still but rooting while growing. Identity is a river, not a stone.',
      slug: 'seed-perspectives-2-en',
      keywords: ['identity', 'roots'],
    },
  },
];

async function resolveUserId(client: SupabaseClient): Promise<string> {
  const targetEmail = process.env.SEED_USER_EMAIL?.trim().toLowerCase();

  const { data, error } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw error;

  const users = data?.users ?? [];
  if (users.length === 0) {
    throw new Error(
      'No auth users found. Create one via Dashboard → Authentication → Users first.'
    );
  }

  if (targetEmail) {
    const match = users.find(u => u.email?.toLowerCase() === targetEmail);
    if (!match) {
      throw new Error(
        `No auth user with email "${targetEmail}". Available: ${users.map(u => u.email).join(', ')}`
      );
    }
    return match.id;
  }

  return users[0].id;
}

async function resolveCategoryMap(
  client: SupabaseClient
): Promise<Map<string, number>> {
  const { data, error } = await client.from('categories').select('id, slug');
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of data ?? []) map.set(row.slug as string, row.id as number);
  return map;
}

async function wipeSeed(client: SupabaseClient): Promise<number> {
  const { data, error } = await client
    .from('posts')
    .delete()
    .eq('author', SEED_AUTHOR)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

async function insertKeywords(
  client: SupabaseClient,
  translationId: number,
  languageId: number,
  keywords: string[]
): Promise<void> {
  if (keywords.length === 0) return;

  const keywordIds: number[] = [];
  for (const keyword of keywords) {
    const { data, error } = await client
      .from('keywords')
      .upsert(
        { keyword, language_id: languageId },
        { onConflict: 'keyword,language_id' }
      )
      .select('id')
      .single();
    if (error) throw error;
    keywordIds.push(data.id as number);
  }

  const { error: linkError } = await client.from('post_keywords').insert(
    keywordIds.map(id => ({
      post_translation_id: translationId,
      keyword_id: id,
    }))
  );
  if (linkError) throw linkError;
}

async function insertTranslation(
  client: SupabaseClient,
  postId: number,
  lang: Lang,
  fx: TranslationFixture
): Promise<void> {
  const languageId = LANGUAGE_IDS[lang];

  const { data, error } = await client
    .from('post_translations')
    .insert({
      post_id: postId,
      language_id: languageId,
      title: fx.title,
      content: fx.content,
      slug: fx.slug,
    })
    .select('id')
    .single();
  if (error) throw error;

  await insertKeywords(client, data.id as number, languageId, fx.keywords);
}

async function insertPost(
  client: SupabaseClient,
  fx: PostFixture,
  userId: string,
  categoryId: number,
  sortOrder: number
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await client
    .from('posts')
    .insert({
      category_id: categoryId,
      user_id: userId,
      author: SEED_AUTHOR,
      is_published: true,
      date: today,
      sort_order: sortOrder,
      image_id: null,
      thumbnail_id: null,
    })
    .select('id')
    .single();
  if (error) throw error;

  const postId = data.id as number;
  await insertTranslation(client, postId, 'ca', fx.ca);
  await insertTranslation(client, postId, 'en', fx.en);
}

async function main() {
  const client = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('Resolving user and categories...');
  const userId = await resolveUserId(client);
  const categoryMap = await resolveCategoryMap(client);

  for (const fx of FIXTURES) {
    if (!categoryMap.has(fx.categorySlug)) {
      throw new Error(
        `Category "${fx.categorySlug}" missing. Did migration 001 run?`
      );
    }
  }

  console.log(`Wiping previous seed (author='${SEED_AUTHOR}')...`);
  const wiped = await wipeSeed(client);
  console.log(`  removed ${wiped} post(s)`);

  console.log(`Inserting ${FIXTURES.length} posts...`);
  const sortCounters = new Map<string, number>();
  for (const fx of FIXTURES) {
    const next = sortCounters.get(fx.categorySlug) ?? 0;
    sortCounters.set(fx.categorySlug, next + 1);
    await insertPost(client, fx, userId, categoryMap.get(fx.categorySlug)!, next);
  }

  const categories = new Set(FIXTURES.map(f => f.categorySlug));
  console.log(
    `seeded ${FIXTURES.length} posts across ${categories.size} categories`
  );
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
