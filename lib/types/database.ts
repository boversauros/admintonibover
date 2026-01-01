export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      categories: {
        Row: {
          id: number;
          slug: string;
        };
        Insert: {
          id?: number;
          slug: string;
        };
        Update: {
          id?: number;
          slug?: string;
        };
        Relationships: [];
      };
      category_translations: {
        Row: {
          category_id: number;
          id: number;
          language_id: number;
          name: string;
        };
        Insert: {
          category_id: number;
          id?: number;
          language_id: number;
          name: string;
        };
        Update: {
          category_id?: number;
          id?: number;
          language_id?: number;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'category_translations_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'category_translations_language_id_fkey';
            columns: ['language_id'];
            isOneToOne: false;
            referencedRelation: 'languages';
            referencedColumns: ['id'];
          },
        ];
      };
      images: {
        Row: {
          alt: string | null;
          created_at: string;
          id: number;
          title: string | null;
          updated_at: string;
          url: string;
        };
        Insert: {
          alt?: string | null;
          created_at?: string;
          id?: number;
          title?: string | null;
          updated_at?: string;
          url: string;
        };
        Update: {
          alt?: string | null;
          created_at?: string;
          id?: number;
          title?: string | null;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      keywords: {
        Row: {
          id: number;
          keyword: string;
          language_id: number;
        };
        Insert: {
          id?: number;
          keyword: string;
          language_id: number;
        };
        Update: {
          id?: number;
          keyword?: string;
          language_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'keywords_language_id_fkey';
            columns: ['language_id'];
            isOneToOne: false;
            referencedRelation: 'languages';
            referencedColumns: ['id'];
          },
        ];
      };
      languages: {
        Row: {
          code: string;
          id: number;
          name: string;
        };
        Insert: {
          code: string;
          id?: number;
          name: string;
        };
        Update: {
          code?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      post_keywords: {
        Row: {
          keyword_id: number;
          post_translation_id: number;
        };
        Insert: {
          keyword_id: number;
          post_translation_id: number;
        };
        Update: {
          keyword_id?: number;
          post_translation_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'post_keywords_keyword_id_fkey';
            columns: ['keyword_id'];
            isOneToOne: false;
            referencedRelation: 'keywords';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_keywords_post_translation_id_fkey';
            columns: ['post_translation_id'];
            isOneToOne: false;
            referencedRelation: 'post_translations';
            referencedColumns: ['id'];
          },
        ];
      };
      post_references: {
        Row: {
          blockquote: string | null;
          id: number;
          post_translation_id: number;
          reference: string;
          sort_order: number;
          type: string;
        };
        Insert: {
          blockquote?: string | null;
          id?: number;
          post_translation_id: number;
          reference: string;
          sort_order?: number;
          type: string;
        };
        Update: {
          blockquote?: string | null;
          id?: number;
          post_translation_id?: number;
          reference?: string;
          sort_order?: number;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_references_post_translation_id_fkey';
            columns: ['post_translation_id'];
            isOneToOne: false;
            referencedRelation: 'post_translations';
            referencedColumns: ['id'];
          },
        ];
      };
      post_translations: {
        Row: {
          content: string;
          id: number;
          language_id: number;
          post_id: number;
          slug: string;
          title: string;
        };
        Insert: {
          content: string;
          id?: number;
          language_id: number;
          post_id: number;
          slug: string;
          title: string;
        };
        Update: {
          content?: string;
          id?: number;
          language_id?: number;
          post_id?: number;
          slug?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_translations_language_id_fkey';
            columns: ['language_id'];
            isOneToOne: false;
            referencedRelation: 'languages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_translations_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
        ];
      };
      posts: {
        Row: {
          author: string;
          category_id: number;
          created_at: string;
          date: string;
          id: number;
          image_id: number | null;
          is_published: boolean;
          thumbnail_id: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          author: string;
          category_id: number;
          created_at?: string;
          date: string;
          id?: number;
          image_id?: number | null;
          is_published?: boolean;
          thumbnail_id?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          author?: string;
          category_id?: number;
          created_at?: string;
          date?: string;
          id?: number;
          image_id?: number | null;
          is_published?: boolean;
          thumbnail_id?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'posts_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'posts_image_id_fkey';
            columns: ['image_id'];
            isOneToOne: false;
            referencedRelation: 'images';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'posts_thumbnail_id_fkey';
            columns: ['thumbnail_id'];
            isOneToOne: false;
            referencedRelation: 'images';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
