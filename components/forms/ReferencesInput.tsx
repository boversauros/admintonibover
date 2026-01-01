"use client";

import { Reference } from "@/lib/types/post";

interface ReferencesInputProps {
  value: Reference[];
  onChange: (references: Reference[]) => void;
}

const GripVerticalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

const TrashIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <polyline points="3,6 5,6 21,6" />
    <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
  </svg>
);

const PlusIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export function ReferencesInput({ value, onChange }: ReferencesInputProps) {
  const handleAdd = () => {
    const newRef: Reference = {
      id: `ref-${Date.now()}`,
      type: "text",
      reference: "",
      blockquote: "",
      sort_order: value.length,
    };
    onChange([...value, newRef]);
  };

  const handleUpdate = (id: string, field: keyof Reference, newValue: any) => {
    onChange(
      value.map((ref) => (ref.id === id ? { ...ref, [field]: newValue } : ref))
    );
  };

  const handleRemove = (id: string) => {
    onChange(value.filter((ref) => ref.id !== id));
  };

  return (
    <div className="w-full space-y-3">
      {value.map((ref) => (
        <div
          key={ref.id}
          className="group border border-default p-4 bg-white/[0.02]"
        >
          <div className="flex items-start gap-3">
            {/* Drag Handle */}
            <div className="pt-1 text-muted cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVerticalIcon />
            </div>

            {/* Content */}
            <div className="flex-1 space-y-3">
              <div className="flex gap-3">
                {/* Type Select */}
                <select
                  value={ref.type}
                  onChange={(e) =>
                    handleUpdate(ref.id, "type", e.target.value as "image" | "text")
                  }
                  className="bg-surface border border-default px-3 py-2 text-sm text-primary focus:outline-none focus:border-slate-500"
                >
                  <option value="text">Cita</option>
                  <option value="image">Imatge</option>
                </select>

                {/* Reference Input */}
                <input
                  type="text"
                  value={ref.reference}
                  onChange={(e) =>
                    handleUpdate(ref.id, "reference", e.target.value)
                  }
                  placeholder="Font o autor..."
                  className="flex-1 bg-transparent border border-default px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-slate-500"
                />
              </div>

              {/* Blockquote Textarea */}
              <textarea
                value={ref.blockquote || ""}
                onChange={(e) =>
                  handleUpdate(ref.id, "blockquote", e.target.value)
                }
                placeholder="Cita o extracte (opcional)..."
                rows={2}
                className="w-full bg-transparent border border-default px-3 py-2 text-sm text-body placeholder:text-muted focus:outline-none focus:border-slate-500 resize-none font-serif italic"
              />
            </div>

            {/* Remove Button */}
            <button
              type="button"
              onClick={() => handleRemove(ref.id)}
              className="p-2 text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      ))}

      {/* Add Reference Button */}
      <button
        type="button"
        onClick={handleAdd}
        className="w-full py-3 border border-dashed border-default text-muted hover:border-subtle hover:text-secondary transition-colors text-sm flex items-center justify-center gap-2"
      >
        <PlusIcon /> Afegeix referència
      </button>
    </div>
  );
}
