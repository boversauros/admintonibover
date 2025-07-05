import { Post, Category, ImageData } from "../types";
import { v4 as uuidv4 } from 'uuid';

// Demo images that would be stored in the database
export const DEMO_IMAGES: ImageData[] = [
  {
    id: 'e51174bd-1074-49be-b9fd-d7d2998c946d',
    url: 'https://picsum.photos/id/1/1200/800',
    title: 'Minimalist Workspace',
    alt: 'Clean and organized workspace with laptop and notebook',
    createdAt: new Date('2025-01-15T10:30:00Z'),
    updatedAt: new Date('2025-01-15T10:30:00Z')
  },
  {
    id: '94f19141-6681-49cb-9407-cf1798ff92c7',
    url: 'https://picsum.photos/id/2/1200/800',
    title: 'Urban Photography',
    alt: 'City street with interesting light and shadows',
    createdAt: new Date('2025-02-20T14:45:00Z'),
    updatedAt: new Date('2025-02-20T14:45:00Z')
  },
  {
    id: 'a3b5c7d9-e8f7-4652-8190-123456789abc',
    url: 'https://picsum.photos/id/3/1200/800',
    title: 'Mountain Landscape',
    alt: 'Beautiful mountain range at sunset',
    createdAt: new Date('2025-03-10T08:15:00Z'),
    updatedAt: new Date('2025-03-10T08:15:00Z')
  },
  {
    id: 'b4c6d8e0-f9e8-1726-3245-6789abcdef01',
    url: 'https://picsum.photos/id/4/1200/800',
    title: 'Coffee Shop',
    alt: 'Cozy coffee shop interior',
    createdAt: new Date('2025-04-05T16:20:00Z'),
    updatedAt: new Date('2025-04-05T16:20:00Z')
  }
];

// Helper function to get a random image from DEMO_IMAGES
const getRandomImageId = (): string => {
  const randomIndex = Math.floor(Math.random() * DEMO_IMAGES.length);
  return DEMO_IMAGES[randomIndex].id;
};

export const DEMO_POSTS: Post[] = [
  {
    id: 'e27d16d3-b07f-4553-be06-1b0bce2334c9',
    title: "La influència del minimalisme en el disseny web modern",
    category: "perspectives",
    language: "ca",
    image_id: 'e51174bd-1074-49be-b9fd-d7d2998c946d',
    thumbnail_id: '94f19141-6681-49cb-9407-cf1798ff92c7',
    content: "<p>Comença a escriure el teu contingut aquí...</p>",
    keywords: ["disseny", "minimalisme", "web"],
    references: {
      images: ["Font de la imatge"],
      texts: ["Font del text"],
    },
    createdAt: new Date('2025-06-01T10:00:00Z'),
    updatedAt: new Date('2025-06-01T10:00:00Z'),
    isPublished: true,
    author: "Admin",
    slug: "influencia-minimalisme-disseny-web-modern"
  },
  {
    id: 'f38a29b4-c52f-4d8e-9a1b-0c7d6e8f9a0b',
    title: "Fotografia urbana: l'essència de la ciutat",
    category: "vivencies",
    language: "ca",
    image_id: '94f19141-6681-49cb-9407-cf1798ff92c7',
    thumbnail_id: 'e51174bd-1074-49be-b9fd-d7d2998c946d',
    content: "<p>Explorant els racons més interessants de la ciutat a través de la lent.</p>",
    keywords: ["fotografia", "ciutat", "urbanisme"],
    references: {
      images: ["Font de la imatge"],
      texts: ["Font del text"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isPublished: true,
  },
  {
    id: uuidv4(),
    title: "El procés creatiu: entre la intuïció i la metodologia",
    category: "influencies",
    language: "ca",
    image: {
      id: uuidv4(),
      url: "https://picsum.photos/1200/800",
      title: "Títol de la imatge",
    },
    thumbnail: {
      id: uuidv4(),
      url: "https://picsum.photos/id/2/1200/800",
      title: "Imatge principal",
    },
    image_id: uuidv4(),
    thumbnail_id: uuidv4(),
    content: "<p>Comença a escriure el teu contingut aquí...</p>",
    keywords: ["paraula clau"],
    references: {
      images: ["Font de la imatge"],
      texts: ["Font del text"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isPublished: false,
  },
  {
    id: uuidv4(),
    title: "Tendències visuals per al 2025",
    category: "perspectives",
    language: "ca",
    image: {
      id: uuidv4(),
      url: "https://picsum.photos/1200/800",
      title: "Títol de la imatge",
    },
    thumbnail: {
      id: uuidv4(),
      url: "https://picsum.photos/id/2/1200/800",
      title: "Imatge principal",
    },
    image_id: uuidv4(),
    thumbnail_id: uuidv4(),
    content: "<p>Comença a escriure el teu contingut aquí...</p>",
    keywords: ["paraula clau"],
    references: {
      images: ["Font de la imatge"],
      texts: ["Font del text"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isPublished: false,
  },
];

export const CATEGORIES: Category[] = [
  { id: "influencies", name: "Influències" },
  { id: "perspectives", name: "Perspectives" },
  { id: "vivencies", name: "Vivències" },
];
