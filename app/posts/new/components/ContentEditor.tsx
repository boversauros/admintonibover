interface ContentEditorProps {
  content: string;
  contentEditMode: boolean;
  setContentEditMode: (edit: boolean) => void;
  onContentChange: (content: string) => void;
}

export const ContentEditor: React.FC<ContentEditorProps> = ({
  content,
  contentEditMode,
  setContentEditMode,
  onContentChange,
}) => {
  return (
    <div className="prose max-w-none">
      <div
        className={`rounded relative ${
          contentEditMode ? "bg-gray-900 border border-gray-800" : ""
        }`}
      >
        {contentEditMode ? (
          <div className="space-y-4 p-4">
            <div
              className="min-h-32 p-2 focus:outline-none text-gray-300"
              contentEditable={true}
              dangerouslySetInnerHTML={{ __html: content }}
              onBlur={(e) => {
                const target = e.target as HTMLElement;
                onContentChange(target.innerHTML);
                setContentEditMode(false);
              }}
            />
            <div className="flex justify-end">
              <button
                className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                onClick={() => setContentEditMode(false)}
              >
                Acabar edició
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => !contentEditMode && setContentEditMode(true)}
            className="cursor-pointer relative group"
          >
            <div
              dangerouslySetInnerHTML={{ __html: content }}
              className="text-gray-300"
            />
            <div className="absolute inset-0 border border-transparent border-dashed group-hover:border-gray-700 rounded opacity-0 group-hover:opacity-100 pointer-events-none"></div>
          </div>
        )}
      </div>
    </div>
  );
};
