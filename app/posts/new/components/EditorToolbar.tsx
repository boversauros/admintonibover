import { Save, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Category, Language } from "../../../../types";

const LANGUAGES = [
  { id: 'ca', name: 'Català' },
  { id: 'en', name: 'English' },
] as const;

interface EditorToolbarProps {
  loading: boolean;
  category: string;
  categories: Category[];
  language: Language;
  onCategoryChange: (category: string) => void;
  onLanguageChange: (language: Language) => void;
  onSave: () => Promise<void>;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  loading,
  category,
  categories,
  language,
  onCategoryChange,
  onLanguageChange,
  onSave,
}) => {
  const router = useRouter();

  return (
    <div className="fixed top-0 left-0 right-0 bg-black/95 border-b border-gray-800/50 z-10">
      <div className="max-w-4xl mx-auto flex justify-between items-center h-20">
        <button
          className="flex items-center gap-1 text-gray-300 hover:text-white transition-colors hover:cursor-pointer"
          onClick={() => router.push("/")}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Tornar</span>
        </button>

        <div className="flex items-center space-x-8">
          <div className="flex items-center gap-4">
            <select
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="text-gray-300 hover:text-white transition-colors hover:cursor-pointer bg-transparent"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id} className="bg-black">
                  {cat.name}
                </option>
              ))}
            </select>

            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value as Language)}
              className="text-gray-300 hover:text-white transition-colors hover:cursor-pointer bg-transparent"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id} className="bg-black">
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onSave}
            className="flex items-center gap-1 text-gray-300 hover:text-white transition-colors"
            disabled={loading}
          >
            <Save className="w-4 h-4" />
            <span>{loading ? "Guardant..." : "Guardar"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
