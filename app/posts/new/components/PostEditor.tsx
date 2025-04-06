import { useState } from "react";
import { CATEGORIES } from "../../../../data";
import { usePostEditor } from "../../hooks/usePostEditor";

import { EditorToolbar } from "./EditorToolbar";
import { EditableField } from "./EditableField";
import { ImageGallery } from "./ImageGallery";
import { ContentEditor } from "./ContentEditor";
import { ReferencesSection } from "./ReferencesSection";
import { KeywordsSection } from "./KeywordsSection";

export interface PostEditorProps {
  postId?: string;
}

const PostEditor: React.FC<PostEditorProps> = ({ postId }) => {
  const [contentEditMode, setContentEditMode] = useState<boolean>(false);

  const {
    post,
    loading,
    activeEditField,
    setActiveEditField,
    handleFieldChange,
    handleArrayAdd,
    handleArrayRemove,
    handleArrayUpdate,
    handleContentChange,
    handleSave,
  } = usePostEditor(postId);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        Carregant...
      </div>
    );
  }

  return (
    <div className="bg-gray-900 text-white min-h-screen">
      <EditorToolbar
        loading={loading}
        category={post.category}
        categories={CATEGORIES}
        onCategoryChange={(category) => handleFieldChange("category", category)}
        onSave={handleSave}
      />

      <main className="pt-32 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <nav className="mb-12">
            <ol className="flex items-center space-x-2 text-sm text-gray-400">
              <li>
                <span className="hover:text-white transition-colors">
                  Reflexions
                </span>
              </li>
              <li>/</li>
              <li>
                <span className="hover:text-white transition-colors">
                  {CATEGORIES.find((c) => c.id === post.category)?.name}
                </span>
              </li>
            </ol>
          </nav>

          <article className="space-y-12">
            <header className="space-y-4">
              <h1 className="text-3xl font-serif text-gray-100">
                <EditableField
                  value={post.title}
                  fieldName="title"
                  activeEditField={activeEditField}
                  setActiveEditField={setActiveEditField}
                  onChange={handleFieldChange}
                />
              </h1>
              <p className="text-sm text-gray-400">
                <EditableField
                  value={post.date}
                  fieldName="date"
                  activeEditField={activeEditField}
                  setActiveEditField={setActiveEditField}
                  onChange={handleFieldChange}
                />
              </p>
            </header>

            <ImageGallery
              images={post.images}
              activeEditField={activeEditField}
              setActiveEditField={setActiveEditField}
              onArrayUpdate={handleArrayUpdate}
              onArrayRemove={handleArrayRemove}
              onArrayAdd={handleArrayAdd}
            />

            <ContentEditor
              content={post.content}
              contentEditMode={contentEditMode}
              setContentEditMode={setContentEditMode}
              onContentChange={handleContentChange}
            />

            <ReferencesSection
              references={post.references}
              activeEditField={activeEditField}
              setActiveEditField={setActiveEditField}
              onArrayAdd={handleArrayAdd}
              onArrayRemove={handleArrayRemove}
              onArrayUpdate={handleArrayUpdate}
            />

            <KeywordsSection
              keywords={post.keywords}
              activeEditField={activeEditField}
              setActiveEditField={setActiveEditField}
              onArrayAdd={handleArrayAdd}
              onArrayRemove={handleArrayRemove}
              onArrayUpdate={handleArrayUpdate}
            />
          </article>
        </div>
      </main>

      <style jsx global>{`
        .prose {
          color: #e2e8f0;
        }

        .prose p {
          margin-bottom: 1.25em;
          color: #d1d5db;
          line-height: 1.7;
        }

        .prose h1,
        .prose h2,
        .prose h3,
        .prose h4 {
          color: #f3f4f6;
          font-weight: 400;
          font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times,
            serif;
          margin-top: 2em;
          margin-bottom: 1em;
        }

        .prose a {
          color: #e2e8f0;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};

export default PostEditor;
