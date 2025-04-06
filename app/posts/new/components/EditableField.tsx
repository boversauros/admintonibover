import React from "react";

export interface EditableFieldProps {
  value: string;
  fieldName: string;
  isMultiline?: boolean;
  isArray?: boolean;
  index?: number | null;
  arrayPath?: string | null;
  className?: string;
  activeEditField: string | null;
  setActiveEditField: (field: string | null) => void;
  onChange: (field: string, value: string) => void;
  onArrayUpdate?: (arrayPath: string, index: number, value: string) => void;
}

export const EditableField: React.FC<EditableFieldProps> = ({
  value,
  fieldName,
  isMultiline = false,
  isArray = false,
  index = null,
  arrayPath = null,
  className = "",
  activeEditField,
  setActiveEditField,
  onChange,
  onArrayUpdate,
}) => {
  const isEditing =
    activeEditField === (index !== null ? `${fieldName}-${index}` : fieldName);

  const startEditing = (): void => {
    setActiveEditField(index !== null ? `${fieldName}-${index}` : fieldName);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void => {
    const newValue = e.target.value;
    if (isArray && index !== null && arrayPath && onArrayUpdate) {
      onArrayUpdate(arrayPath, index, newValue);
    } else {
      onChange(fieldName, newValue);
    }
  };

  const handleBlur = (): void => {
    setActiveEditField(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" && !isMultiline) {
      setActiveEditField(null);
    }
  };

  return (
    <div
      className={`editable-field-container relative group cursor-pointer ${className}`}
      onClick={!isEditing ? startEditing : undefined}
    >
      {isEditing ? (
        isMultiline ? (
          <textarea
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            className="w-full p-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none"
            rows={3}
            autoFocus
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full p-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none"
            autoFocus
          />
        )
      ) : (
        <>
          <div className="editable-content">
            {value || (
              <span className="text-gray-500 italic">Clica per editar</span>
            )}
          </div>
          <div className="absolute inset-0 border border-transparent border-dashed group-hover:border-gray-600 rounded transition-all opacity-0 group-hover:opacity-100"></div>
        </>
      )}
    </div>
  );
};
