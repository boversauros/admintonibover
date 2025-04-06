import { Save, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Category } from "../../../../types";

interface EditorToolbarProps {
  loading: boolean;
  category: string;
  categories: Category[];
  onCategoryChange: (category: string) => void;
  onSave: () => Promise<void>;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  loading,
  category,
  categories,
  onCategoryChange,
  onSave,
}) => {
  const router = useRouter();

  return (
    <div className="fixed top-0 left-0 right-0 bg-gray-900 border-b border-gray-800 z-10 px-6 py-3">
      <div className="max-w-4xl mx-auto flex justify-between items-center">
        <button
          className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
          onClick={() => router.push("/")}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Tornar</span>
        </button>

        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded px-3 py-1 text-gray-300"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <button
            onClick={onSave}
            className="flex items-center gap-1 px-4 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
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
