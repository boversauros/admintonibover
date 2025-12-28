import { supabase } from "../supabase";

export interface Category {
  id: number;
  slug: string;
  name_ca: string;
  name_en: string;
}

/**
 * Fetches all categories from Supabase with their translations
 */
export async function getCategories(): Promise<Category[]> {
  try {
    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select(
        `
        id,
        slug,
        category_translations (
          language_id,
          name
        )
      `
      )
      .order("id", { ascending: true });

    if (categoriesError) throw categoriesError;
    if (!categories || categories.length === 0) return [];

    // Transform to flat structure with both language names
    const formattedCategories: Category[] = categories.map((cat: any) => {
      const translations = cat.category_translations || [];
      const caTranslation = translations.find((t: any) => t.language_id === 1); // ca
      const enTranslation = translations.find((t: any) => t.language_id === 2); // en

      return {
        id: cat.id,
        slug: cat.slug,
        name_ca: caTranslation?.name || cat.slug,
        name_en: enTranslation?.name || cat.slug,
      };
    });

    return formattedCategories;
  } catch (error) {
    console.error("Error fetching categories:", error);
    throw new Error("Failed to fetch categories from database");
  }
}
