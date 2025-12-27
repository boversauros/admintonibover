import { Button, Select, Input, Textarea } from '@/components/ui';
import { Reference } from '@/lib/types/post';

interface ReferencesInputProps {
  value: Reference[];
  onChange: (references: Reference[]) => void;
}

export function ReferencesInput({ value, onChange }: ReferencesInputProps) {
  const handleAdd = () => {
    const newRef: Reference = {
      id: `ref-${Date.now()}`,
      type: 'text',
      reference: '',
      blockquote: '',
      sort_order: value.length,
    };
    onChange([...value, newRef]);
  };

  const handleUpdate = (id: string, field: keyof Reference, newValue: any) => {
    onChange(
      value.map(ref =>
        ref.id === id ? { ...ref, [field]: newValue } : ref
      )
    );
  };

  const handleRemove = (id: string) => {
    onChange(value.filter(ref => ref.id !== id));
  };

  return (
    <div className="w-full">
      {value.length > 0 && (
        <div className="space-y-4 mb-4">
          {value.map((ref, index) => (
            <div key={ref.id} className="border border-default p-4 rounded">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-medium text-primary">Reference {index + 1}</h4>
                <Button
                  variant="icon"
                  onClick={() => handleRemove(ref.id)}
                  type="button"
                  aria-label="Remove reference"
                >
                  ×
                </Button>
              </div>

              <div className="space-y-3">
                <Select
                  label="Type"
                  value={ref.type}
                  onChange={(e) => handleUpdate(ref.id, 'type', e.target.value as 'image' | 'text')}
                  options={[
                    { value: 'text', label: 'Text' },
                    { value: 'image', label: 'Image' },
                  ]}
                />

                <Input
                  label="Reference/Citation"
                  value={ref.reference}
                  onChange={(e) => handleUpdate(ref.id, 'reference', e.target.value)}
                  placeholder="Enter reference or citation..."
                />

                <Textarea
                  label="Blockquote"
                  value={ref.blockquote}
                  onChange={(e) => handleUpdate(ref.id, 'blockquote', e.target.value)}
                  placeholder="Enter blockquote text..."
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="ghost" onClick={handleAdd} type="button">
        Add Reference
      </Button>
    </div>
  );
}
