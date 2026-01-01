"use client";

import { Reference } from "@/lib/types/post";
import { Icon, Input, Select, Textarea, Button } from "@/components/ui";

interface ReferencesInputProps {
  value: Reference[];
  onChange: (references: Reference[]) => void;
}

const referenceTypeOptions = [
  { value: "text", label: "Text" },
  { value: "image", label: "Imatge" },
];

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
          className="group border border-default p-4 bg-overlay-2"
        >
          <div className="flex items-start gap-3">
            {/* Drag Handle */}
            <div className="pt-1 text-muted cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">
              <Icon name="grip-vertical" />
            </div>

            {/* Content */}
            <div className="flex-1 space-y-3">
              <div className="flex gap-3">
                {/* Type Select */}
                <Select
                  value={ref.type}
                  onChange={(e) =>
                    handleUpdate(
                      ref.id,
                      "type",
                      e.target.value as "image" | "text"
                    )
                  }
                  options={referenceTypeOptions}
                  size="sm"
                  wrapperClassName="w-auto"
                />

                {/* Reference Input */}
                <Input
                  type="text"
                  value={ref.reference}
                  onChange={(e) =>
                    handleUpdate(ref.id, "reference", e.target.value)
                  }
                  placeholder="Font o autor..."
                  size="sm"
                  wrapperClassName="flex-1"
                  className="bg-transparent"
                />
              </div>

              {/* Blockquote Textarea */}
              <Textarea
                value={ref.blockquote || ""}
                onChange={(e) =>
                  handleUpdate(ref.id, "blockquote", e.target.value)
                }
                placeholder="Cita o extracte (opcional)..."
                size="sm"
                className="bg-transparent font-serif italic text-body min-h-16"
              />
            </div>

            {/* Remove Button */}
            <Button
              variant="icon"
              onClick={() => handleRemove(ref.id)}
              className="opacity-0 group-hover:opacity-100 hover:text-red-400"
            >
              <Icon name="trash" />
            </Button>
          </div>
        </div>
      ))}

      {/* Add Reference Button */}
      <button
        type="button"
        onClick={handleAdd}
        className="w-full py-3 border border-dashed border-default text-muted hover:border-subtle hover:text-secondary transition-colors text-sm flex items-center justify-center gap-2"
      >
        <Icon name="plus" /> Afegeix referència
      </button>
    </div>
  );
}
