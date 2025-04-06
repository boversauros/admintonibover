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
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="text-gray-300 hover:text-white transition-colors hover:cursor-pointer"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

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
