export type InitialCategory = {
  readonly id: string;
  readonly slug: string;
  readonly names: {
    readonly ca: string;
    readonly en: string;
  };
};

// Mirrors the reference rows created by 001_initial_schema.sql. AWS catalog
// entries override these defaults, while new catalog rows are appended.
export const INITIAL_CATEGORY_CATALOG = [
  {
    id: '1',
    slug: 'vivencies',
    names: { ca: 'Vivències', en: 'Experiences' },
  },
  {
    id: '2',
    slug: 'influencies',
    names: { ca: 'Influències', en: 'Influences' },
  },
  {
    id: '3',
    slug: 'perspectives',
    names: { ca: 'Perspectives', en: 'Perspectives' },
  },
] as const satisfies readonly InitialCategory[];
