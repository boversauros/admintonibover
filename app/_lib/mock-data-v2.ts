import {
  PostV2,
  PostTranslationV2,
  CategoryV2,
  ImageDataV2,
  UserV2,
  KeywordV2,
  PostListItemV2,
} from "./types-v2";

// Reuse some existing data but with V2 suffix
export const DEMO_IMAGES_V2: ImageDataV2[] = [
  {
    id: 1,
    url: "https://picsum.photos/id/1/1200/800",
    title: "Minimalist Workspace",
    alt: "Clean and organized workspace with laptop and notebook",
    created_at: new Date("2024-01-15T10:30:00Z"),
    updated_at: new Date("2024-01-15T10:30:00Z"),
  },
  {
    id: 2,
    url: "https://picsum.photos/id/2/1200/800",
    title: "Urban Photography",
    alt: "City street with interesting light and shadows",
    created_at: new Date("2024-02-20T14:45:00Z"),
    updated_at: new Date("2024-02-20T14:45:00Z"),
  },
  {
    id: 3,
    url: "https://picsum.photos/id/3/1200/800",
    title: "Mountain Landscape",
    alt: "Beautiful mountain range at sunset",
    created_at: new Date("2024-03-10T08:15:00Z"),
    updated_at: new Date("2024-03-10T08:15:00Z"),
  },
  {
    id: 4,
    url: "https://picsum.photos/id/4/1200/800",
    title: "Coffee Shop",
    alt: "Cozy coffee shop interior",
    created_at: new Date("2024-04-05T16:20:00Z"),
    updated_at: new Date("2024-04-05T16:20:00Z"),
  },
];

export const DEMO_USER_V2: UserV2 = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "admin@tonibover.com",
  created_at: new Date("2024-01-01T00:00:00Z"),
};

export const CATEGORIES_V2: CategoryV2[] = [
  {
    id: 1,
    name: "Perspectives",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 2,
    name: "Vivències",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 3,
    name: "Reflexions",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
];

// Keywords organized by language
export const KEYWORDS_V2: KeywordV2[] = [
  // Catalan keywords
  {
    id: 1,
    keyword: "disseny",
    language: "ca",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 2,
    keyword: "web",
    language: "ca",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 3,
    keyword: "desenvolupament",
    language: "ca",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 4,
    keyword: "programació",
    language: "ca",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 5,
    keyword: "creativitat",
    language: "ca",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 6,
    keyword: "innovació",
    language: "ca",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 7,
    keyword: "tecnologia",
    language: "ca",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 8,
    keyword: "fotografia",
    language: "ca",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 9,
    keyword: "barcelona",
    language: "ca",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 10,
    keyword: "minimalisme",
    language: "ca",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },

  // English keywords
  {
    id: 11,
    keyword: "design",
    language: "en",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 12,
    keyword: "web",
    language: "en",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 13,
    keyword: "development",
    language: "en",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 14,
    keyword: "programming",
    language: "en",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 15,
    keyword: "creativity",
    language: "en",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 16,
    keyword: "innovation",
    language: "en",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 17,
    keyword: "technology",
    language: "en",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 18,
    keyword: "photography",
    language: "en",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 19,
    keyword: "barcelona",
    language: "en",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
  {
    id: 20,
    keyword: "minimalism",
    language: "en",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  },
];

// Core posts (language-agnostic)
export const DEMO_POSTS_V2: PostV2[] = [
  {
    id: 1,
    user_id: DEMO_USER_V2.id,
    category_id: 1,
    image_id: 1,
    thumbnail_id: 1,
    is_published: true,
    date: new Date("2024-06-01T10:00:00Z"),
    created_at: new Date("2024-06-01T10:00:00Z"),
    updated_at: new Date("2024-06-15T14:30:00Z"),
  },
  {
    id: 2,
    user_id: DEMO_USER_V2.id,
    category_id: 2,
    image_id: 2,
    thumbnail_id: 2,
    is_published: true,
    date: new Date("2024-07-10T09:00:00Z"),
    created_at: new Date("2024-07-10T09:00:00Z"),
    updated_at: new Date("2024-07-10T09:00:00Z"),
  },
  {
    id: 3,
    user_id: DEMO_USER_V2.id,
    category_id: 3,
    image_id: 3,
    thumbnail_id: 3,
    is_published: false,
    date: new Date("2024-08-05T11:30:00Z"),
    created_at: new Date("2024-08-05T11:30:00Z"),
    updated_at: new Date("2024-08-06T10:15:00Z"),
  },
];

// Post translations
export const DEMO_POST_TRANSLATIONS_V2: PostTranslationV2[] = [
  // Post 1 - Catalan
  {
    id: 1,
    post_id: 1,
    language: "ca",
    title: "La influència del minimalisme en el disseny web modern",
    content:
      "<p>El minimalisme ha transformat la manera com concebem el disseny web. Aquesta filosofia, que prioritza la simplicitat i la funcionalitat, ha esdevingut una tendència dominant en el món digital.</p><p>En aquest article, explorarem com el minimalisme no només millora l'estètica visual, sinó que també optimitza l'experiència de l'usuari i el rendiment del lloc web.</p>",
    slug: "influencia-minimalisme-disseny-web-modern",
    references_images: ["https://example.com/minimal-design-examples"],
    references_texts: [
      "Nielsen Norman Group - Minimalism in Web Design",
      "A List Apart - The Elements of Content Strategy",
    ],
    created_at: new Date("2024-06-01T10:00:00Z"),
    updated_at: new Date("2024-06-15T14:30:00Z"),
    keywords: [
      KEYWORDS_V2.find((k) => k.keyword === "disseny" && k.language === "ca")!,
      KEYWORDS_V2.find(
        (k) => k.keyword === "minimalisme" && k.language === "ca"
      )!,
      KEYWORDS_V2.find((k) => k.keyword === "web" && k.language === "ca")!,
    ],
  },
  // Post 1 - English
  {
    id: 2,
    post_id: 1,
    language: "en",
    title: "The influence of minimalism in modern web design",
    content:
      "<p>Minimalism has transformed the way we conceive web design. This philosophy, which prioritizes simplicity and functionality, has become a dominant trend in the digital world.</p><p>In this article, we'll explore how minimalism not only improves visual aesthetics but also optimizes user experience and website performance.</p>",
    slug: "influence-minimalism-modern-web-design",
    references_images: ["https://example.com/minimal-design-examples"],
    references_texts: [
      "Nielsen Norman Group - Minimalism in Web Design",
      "A List Apart - The Elements of Content Strategy",
    ],
    created_at: new Date("2024-06-01T10:00:00Z"),
    updated_at: new Date("2024-06-15T14:30:00Z"),
    keywords: [
      KEYWORDS_V2.find((k) => k.keyword === "design" && k.language === "en")!,
      KEYWORDS_V2.find(
        (k) => k.keyword === "minimalism" && k.language === "en"
      )!,
      KEYWORDS_V2.find((k) => k.keyword === "web" && k.language === "en")!,
    ],
  },
  // Post 2 - Catalan only
  {
    id: 3,
    post_id: 2,
    language: "ca",
    title: "Fotografia urbana: capturant l'essència de la ciutat",
    content:
      "<p>Les ciutats són organismes vius que mai dormen. Cada racó, cada carrer, cada instant ofereix una oportunitat única per capturar històries visuals que parlen de la vida urbana.</p><p>En aquesta reflexió, compartiré la meva experiència explorant Barcelona amb la càmera, buscant aquells moments fugaços que defineixen el caràcter de la ciutat.</p>",
    slug: "fotografia-urbana-essencia-ciutat",
    references_images: ["https://unsplash.com/collections/urban-photography"],
    references_texts: ["Henri Cartier-Bresson - The Decisive Moment"],
    created_at: new Date("2024-07-10T09:00:00Z"),
    updated_at: new Date("2024-07-10T09:00:00Z"),
    keywords: [
      KEYWORDS_V2.find(
        (k) => k.keyword === "fotografia" && k.language === "ca"
      )!,
      KEYWORDS_V2.find(
        (k) => k.keyword === "barcelona" && k.language === "ca"
      )!,
    ],
  },
  // Post 3 - Catalan
  {
    id: 4,
    post_id: 3,
    language: "ca",
    title: "El procés creatiu: entre la intuïció i la metodologia",
    content:
      "<p>El procés creatiu és un viatge fascinant entre el caos i l'ordre, entre la inspiració espontània i la disciplina metodològica.</p><p>Després de vint anys treballant en projectes creatius, he après que la creativitat no és només un do, sinó també una habilitat que es pot cultivar.</p>",
    slug: "proces-creatiu-intuicio-metodologia",
    references_images: [],
    references_texts: [
      "The Creative Act by Rick Rubin",
      "Big Magic by Elizabeth Gilbert",
    ],
    created_at: new Date("2024-08-05T11:30:00Z"),
    updated_at: new Date("2024-08-06T10:15:00Z"),
    keywords: [
      KEYWORDS_V2.find(
        (k) => k.keyword === "creativitat" && k.language === "ca"
      )!,
    ],
  },
  // Post 3 - English
  {
    id: 5,
    post_id: 3,
    language: "en",
    title: "The creative process: between intuition and methodology",
    content:
      "<p>The creative process is a fascinating journey between chaos and order, between spontaneous inspiration and methodological discipline.</p><p>After twenty years working on creative projects, I've learned that creativity is not just a gift, but also a skill that can be cultivated.</p>",
    slug: "creative-process-intuition-methodology",
    references_images: [],
    references_texts: [
      "The Creative Act by Rick Rubin",
      "Big Magic by Elizabeth Gilbert",
    ],
    created_at: new Date("2024-08-05T11:30:00Z"),
    updated_at: new Date("2024-08-06T10:15:00Z"),
    keywords: [
      KEYWORDS_V2.find(
        (k) => k.keyword === "creativity" && k.language === "en"
      )!,
    ],
  },
];

// Helper function to get post list items with default translation
export function getPostListItems(): PostListItemV2[] {
  return DEMO_POSTS_V2.map((post) => {
    const translations = DEMO_POST_TRANSLATIONS_V2.filter(
      (t) => t.post_id === post.id
    );
    const defaultTranslation =
      translations.find((t) => t.language === "ca") || translations[0];

    return {
      id: post.id,
      category_id: post.category_id,
      is_published: post.is_published,
      date: post.date,
      created_at: post.created_at,
      updated_at: post.updated_at,
      image: DEMO_IMAGES_V2.find((img) => img.id === post.image_id),
      thumbnail: DEMO_IMAGES_V2.find((img) => img.id === post.thumbnail_id),
      default_translation: defaultTranslation
        ? {
            title: defaultTranslation.title,
            slug: defaultTranslation.slug,
            language: defaultTranslation.language,
          }
        : undefined,
      translation_count: translations.length,
    };
  });
}
