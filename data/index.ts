import { Post, Category, ImageData, User } from "../types";

// Demo images that would be stored in the database
export const DEMO_IMAGES: ImageData[] = [
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

// Demo users
export const DEMO_USER: User = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "admin@tonibover.com",
  created_at: new Date("2024-01-01T00:00:00Z"),
};

export const DEMO_POSTS: Post[] = [
  {
    id: 1,
    title: "La influència del minimalisme en el disseny web modern",
    category_id: 1,
    content:
      "<p>El minimalisme ha transformat la manera com concebem el disseny web. Aquesta filosofia, que prioritza la simplicitat i la funcionalitat, ha esdevingut una tendència dominant en el món digital.</p><p>En aquest article, explorarem com el minimalisme no només millora l'estètica visual, sinó que també optimitza l'experiència de l'usuari i el rendiment del lloc web.</p>",
    language: "ca",
    image_id: 1,
    thumbnail_id: 1,
    keywords: ["disseny", "minimalisme", "web", "UX", "UI"],
    references: {
      images: ["https://example.com/minimal-design-examples"],
      texts: [
        "Nielsen Norman Group - Minimalism in Web Design",
        "A List Apart - The Elements of Content Strategy",
      ],
    },
    created_at: new Date("2024-06-01T10:00:00Z"),
    updated_at: new Date("2024-06-15T14:30:00Z"),
    is_published: true,
    date: new Date("2024-06-01T10:00:00Z"),
    user_id: DEMO_USER.id,
    author: "Toni Bover",
    slug: "influencia-minimalisme-disseny-web-modern",
    tags: ["design", "web", "trends"],
    // Populated references
    image: DEMO_IMAGES[0],
    thumbnail: DEMO_IMAGES[0],
  },
  {
    id: 2,
    title: "Fotografia urbana: capturant l'essència de la ciutat",
    category_id: 2,
    content:
      "<p>Les ciutats són organismes vius que mai dormen. Cada racó, cada carrer, cada instant ofereix una oportunitat única per capturar històries visuals que parlen de la vida urbana.</p><p>En aquesta reflexió, compartiré la meva experiència explorant Barcelona amb la càmera, buscant aquells moments fugaços que defineixen el caràcter de la ciutat.</p>",
    language: "ca",
    image_id: 2,
    thumbnail_id: 2,
    keywords: ["fotografia", "ciutat", "Barcelona", "street photography"],
    references: {
      images: ["https://unsplash.com/collections/urban-photography"],
      texts: ["Henri Cartier-Bresson - The Decisive Moment"],
    },
    created_at: new Date("2024-07-10T09:00:00Z"),
    updated_at: new Date("2024-07-10T09:00:00Z"),
    is_published: true,
    date: new Date("2024-07-10T09:00:00Z"),
    user_id: DEMO_USER.id,
    author: "Toni Bover",
    slug: "fotografia-urbana-essencia-ciutat",
    tags: ["photography", "urban", "barcelona"],
    image: DEMO_IMAGES[1],
    thumbnail: DEMO_IMAGES[1],
  },
  {
    id: 3,
    title: "El procés creatiu: entre la intuïció i la metodologia",
    category_id: 3,
    content:
      "<p>El procés creatiu és un viatge fascinant entre el caos i l'ordre, entre la inspiració espontània i la disciplina metodològica.</p><p>Després de vint anys treballant en projectes creatius, he après que la creativitat no és només un do, sinó també una habilitat que es pot cultivar.</p>",
    language: "ca",
    image_id: 3,
    thumbnail_id: 3,
    keywords: ["creativitat", "procés", "metodologia", "inspiració"],
    references: {
      images: [],
      texts: [
        "The Creative Act by Rick Rubin",
        "Big Magic by Elizabeth Gilbert",
      ],
    },
    created_at: new Date("2024-08-05T11:30:00Z"),
    updated_at: new Date("2024-08-06T10:15:00Z"),
    is_published: false,
    date: new Date("2024-08-05T11:30:00Z"),
    user_id: DEMO_USER.id,
    author: "Toni Bover",
    slug: "proces-creatiu-intuicio-metodologia",
    tags: ["creativity", "process", "methodology"],
    image: DEMO_IMAGES[2],
    thumbnail: DEMO_IMAGES[2],
  },
];

export const CATEGORIES: Category[] = [
  { id: 1, name: "Perspectives" },
  { id: 2, name: "Vivències" },
  { id: 3, name: "Reflexions" },
];

export const LANGUAGES = [
  { id: 1, code: "ca", name: "Català" },
  { id: 2, code: "en", name: "English" },
] as const;
