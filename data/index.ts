export interface Post {
  id: string;
  title: string;
  category: "influencies" | "perspectives" | "vivencies";
  date: string;
  isPublished: boolean;
}

export interface Category {
  id: string;
  name: string;
}

export const DEMO_POSTS: Post[] = [
  {
    id: "1",
    title: "La influència del minimalisme en el disseny web modern",
    category: "perspectives",
    date: "12 de març de 2025",
    isPublished: true,
  },
  {
    id: "2",
    title: "Fotografia urbana: l'essència de la ciutat",
    category: "vivencies",
    date: "5 de febrer de 2025",
    isPublished: true,
  },
  {
    id: "3",
    title: "El procés creatiu: entre la intuïció i la metodologia",
    category: "influencies",
    date: "18 de gener de 2025",
    isPublished: false,
  },
  {
    id: "4",
    title: "Tendències visuals per al 2025",
    category: "perspectives",
    date: "2 de gener de 2025",
    isPublished: false,
  },
];

export const CATEGORIES: Category[] = [
  { id: "influencies", name: "Influències" },
  { id: "perspectives", name: "Perspectives" },
  { id: "vivencies", name: "Vivències" },
];
