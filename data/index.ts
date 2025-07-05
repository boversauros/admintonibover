import { Post, Category } from "../types";

export const DEMO_POSTS: Post[] = [
  {
    id: "1",
    title: "La influència del minimalisme en el disseny web modern",
    category: "perspectives",
    language: "ca",
    image: {
      url: "https://picsum.photos/1200/800",
      title: "Títol de la imatge",
    },
    thumbnail: {
      url: "https://picsum.photos/id/2/1200/800",
      title: "Imatge principal",
    },
    content: "<p>Comença a escriure el teu contingut aquí...</p>",
    keywords: ["paraula clau"],
    references: {
      images: ["Font de la imatge"],
      texts: ["Font del text"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isPublished: true,
  },
  {
    id: "2",
    title: "Fotografia urbana: l'essència de la ciutat",
    category: "vivencies",
    language: "ca",
    image: {
      url: "https://picsum.photos/1200/800",
      title: "Títol de la imatge",
    },
    thumbnail: {
      url: "https://picsum.photos/id/2/1200/800",
      title: "Imatge principal",
    },
    content: "<p>Comença a escriure el teu contingut aquí...</p>",
    keywords: ["paraula clau"],
    references: {
      images: ["Font de la imatge"],
      texts: ["Font del text"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isPublished: true,
  },
  {
    id: "3",
    title: "El procés creatiu: entre la intuïció i la metodologia",
    category: "influencies",
    language: "ca",
    image: {
      url: "https://picsum.photos/1200/800",
      title: "Títol de la imatge",
    },
    thumbnail: {
      url: "https://picsum.photos/id/2/1200/800",
      title: "Imatge principal",
    },
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
    id: "4",
    title: "Tendències visuals per al 2025",
    category: "perspectives",
    language: "ca",
    image: {
      url: "https://picsum.photos/1200/800",
      title: "Títol de la imatge",
    },
    thumbnail: {
      url: "https://picsum.photos/id/2/1200/800",
      title: "Imatge principal",
    },
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
