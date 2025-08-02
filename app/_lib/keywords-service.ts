import { ApiResponse, Keyword } from "./types";
import { MOCK_KEYWORDS } from "./mock-data";

class KeywordsService {
  private keywords: Keyword[] = [...MOCK_KEYWORDS];
  private nextId: number = Math.max(...MOCK_KEYWORDS.map((k) => k.id)) + 1;

  // Helper to get language_id from language code
  private getLanguageId(languageCode: "ca" | "en"): number {
    return languageCode === "ca" ? 1 : 2;
  }

  // Simulate async database operations
  private delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  async search(
    query: string,
    languageCode: "ca" | "en"
  ): Promise<ApiResponse<Keyword[]>> {
    await this.delay(100);

    try {
      const languageId = this.getLanguageId(languageCode);
      const filteredKeywords = this.keywords
        .filter(
          (k) =>
            k.language_id === languageId &&
            k.keyword.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 10); // Limit results to 10

      return { data: filteredKeywords };
    } catch (error) {
      return { error: "Failed to search keywords" };
    }
  }

  async getByLanguage(
    languageCode: "ca" | "en"
  ): Promise<ApiResponse<Keyword[]>> {
    await this.delay(100);

    try {
      const languageId = this.getLanguageId(languageCode);
      const filteredKeywords = this.keywords.filter(
        (k) => k.language_id === languageId
      );
      return { data: filteredKeywords };
    } catch (error) {
      return { error: "Failed to fetch keywords" };
    }
  }

  async create(
    keyword: string,
    languageCode: "ca" | "en"
  ): Promise<ApiResponse<Keyword>> {
    await this.delay(200);

    try {
      const languageId = this.getLanguageId(languageCode);

      // Check if keyword already exists for this language
      const existing = this.keywords.find(
        (k) =>
          k.keyword.toLowerCase() === keyword.toLowerCase() &&
          k.language_id === languageId
      );

      if (existing) {
        return { data: existing };
      }

      const newKeyword: Keyword = {
        id: this.nextId++,
        keyword: keyword.trim(),
        language_id: languageId,
      };

      this.keywords.push(newKeyword);
      return { data: newKeyword };
    } catch (error) {
      return { error: "Failed to create keyword" };
    }
  }

  async getById(id: number): Promise<ApiResponse<Keyword>> {
    await this.delay(50);

    try {
      const keyword = this.keywords.find((k) => k.id === id);
      if (!keyword) {
        return { error: "Keyword not found" };
      }
      return { data: keyword };
    } catch (error) {
      return { error: "Failed to fetch keyword" };
    }
  }
}

export const keywordsService = new KeywordsService();
