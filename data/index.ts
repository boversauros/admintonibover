import { Post, Category } from "../types";

import { v4 as uuidv4 } from 'uuid';

export const DEMO_POSTS: Post[] = [
  {
    id: uuidv4(),
    title: "La influència del minimalisme en el disseny web modern",
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
    isPublished: true,
  },
  {
    id: uuidv4(),
    title: "Fotografia urbana: l'essència de la ciutat",
    category: "vivencies",
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
