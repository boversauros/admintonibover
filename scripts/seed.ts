import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

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
const SEED_IMAGE_TITLE_PREFIX = 'SEED:';
const SEED_IMAGES_DIR = join(process.cwd(), 'scripts', 'seed-images');

const LANGUAGE_IDS = { ca: 1, en: 2 } as const;

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

type Lang = 'ca' | 'en';

type Bucket = 'post-images' | 'post-thumbnails';

type TranslationFixture = {
  title: string;
  content: string;
  slug: string;
  keywords: string[];
};

type PostFixture = {
  categorySlug: 'vivencies' | 'influencies' | 'perspectives';
  ca?: TranslationFixture;
  en?: TranslationFixture;
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

function bucketAndPathFromUrl(url: string): { bucket: Bucket; path: string } | null {
  const marker = '/object/public/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rest = url.slice(idx + marker.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  const bucket = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (bucket !== 'post-images' && bucket !== 'post-thumbnails') return null;
  return { bucket: bucket as Bucket, path };
}

async function wipeSeedImages(client: SupabaseClient): Promise<number> {
  const { data, error } = await client
    .from('images')
    .select('id, url')
    .like('title', `${SEED_IMAGE_TITLE_PREFIX}%`);
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return 0;

  const byBucket: Record<Bucket, string[]> = {
    'post-images': [],
    'post-thumbnails': [],
  };
  for (const row of rows) {
    const parsed = bucketAndPathFromUrl(row.url as string);
    if (parsed) byBucket[parsed.bucket].push(parsed.path);
  }
  for (const bucket of Object.keys(byBucket) as Bucket[]) {
    const paths = byBucket[bucket];
    if (paths.length === 0) continue;
    const { error: storageError } = await client.storage
      .from(bucket)
      .remove(paths);
    if (storageError) {
      console.warn(`  storage cleanup warning (${bucket}): ${storageError.message}`);
    }
  }

  const { error: deleteError } = await client
    .from('images')
    .delete()
    .like('title', `${SEED_IMAGE_TITLE_PREFIX}%`);
  if (deleteError) throw deleteError;

  return rows.length;
}

function discoverPoolFiles(): { main: string[]; thumb: string[] } {
  let entries: string[];
  try {
    entries = readdirSync(SEED_IMAGES_DIR);
  } catch {
    throw new Error(
      `Missing ${SEED_IMAGES_DIR}. Create it and drop main-*/thumb-* images inside.`
    );
  }
  const main: string[] = [];
  const thumb: string[] = [];
  for (const name of entries) {
    const ext = extname(name).toLowerCase();
    if (!MIME_BY_EXT[ext]) continue;
    if (name.startsWith('main-')) main.push(name);
    else if (name.startsWith('thumb-')) thumb.push(name);
  }
  if (main.length === 0 || thumb.length === 0) {
    throw new Error(
      `Need at least one main-* and one thumb-* image in ${SEED_IMAGES_DIR}. ` +
        `Found main: [${main.join(', ')}], thumb: [${thumb.join(', ')}].`
    );
  }
  return { main, thumb };
}

async function uploadSeedImage(
  client: SupabaseClient,
  bucket: Bucket,
  localFile: string
): Promise<string> {
  const ext = extname(localFile).toLowerCase();
  const contentType = MIME_BY_EXT[ext];
  if (!contentType) {
    throw new Error(`Unsupported image extension on ${localFile}`);
  }
  const buffer = readFileSync(join(SEED_IMAGES_DIR, localFile));
  const key = `seed-${localFile}`;

  const { error } = await client.storage.from(bucket).upload(key, buffer, {
    contentType,
    upsert: true,
    cacheControl: '3600',
  });
  if (error) throw new Error(`Upload failed for ${localFile}: ${error.message}`);

  const { data } = client.storage.from(bucket).getPublicUrl(key);
  return data.publicUrl;
}

async function createSeedImageRecord(
  client: SupabaseClient,
  url: string,
  localFile: string
): Promise<number> {
  const { data, error } = await client
    .from('images')
    .insert({
      url,
      title: `${SEED_IMAGE_TITLE_PREFIX} ${localFile}`,
      alt: 'Sample seed image',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as number;
}

async function uploadPool(client: SupabaseClient): Promise<{
  mainIds: number[];
  thumbIds: number[];
}> {
  const { main, thumb } = discoverPoolFiles();
  const mainIds: number[] = [];
  const thumbIds: number[] = [];

  for (const file of main) {
    const url = await uploadSeedImage(client, 'post-images', file);
    mainIds.push(await createSeedImageRecord(client, url, file));
  }
  for (const file of thumb) {
    const url = await uploadSeedImage(client, 'post-thumbnails', file);
    thumbIds.push(await createSeedImageRecord(client, url, file));
  }

  console.log(
    `  uploaded ${main.length} main + ${thumb.length} thumb image(s)`
  );
  return { mainIds, thumbIds };
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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
  sortOrder: number,
  imageId: number,
  thumbnailId: number
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
      image_id: imageId,
      thumbnail_id: thumbnailId,
    })
    .select('id')
    .single();
  if (error) throw error;

  const postId = data.id as number;
  if (fx.ca) await insertTranslation(client, postId, 'ca', fx.ca);
  if (fx.en) await insertTranslation(client, postId, 'en', fx.en);
}

async function main() {
  const client = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const fx of FIXTURES) {
    if (!fx.ca && !fx.en) {
      throw new Error(
        `Fixture in category "${fx.categorySlug}" has no translations. Need at least one of ca/en.`
      );
    }
  }

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

  console.log('Wiping previous seed images...');
  const wipedImages = await wipeSeedImages(client);
  console.log(`  removed ${wipedImages} image(s)`);

  console.log('Uploading seed image pool...');
  const { mainIds, thumbIds } = await uploadPool(client);

  console.log(`Inserting ${FIXTURES.length} posts...`);
  const sortCounters = new Map<string, number>();
  for (const fx of FIXTURES) {
    const next = sortCounters.get(fx.categorySlug) ?? 0;
    sortCounters.set(fx.categorySlug, next + 1);
    await insertPost(
      client,
      fx,
      userId,
      categoryMap.get(fx.categorySlug)!,
      next,
      pickRandom(mainIds),
      pickRandom(thumbIds)
    );
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
