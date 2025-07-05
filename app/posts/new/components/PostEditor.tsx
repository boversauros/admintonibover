import { useState, useEffect } from "react";
import { CATEGORIES } from "../../../../data";
import { usePostEditor } from "../../hooks/usePostEditor";
import { Post, ImageData } from "../../../../types";

import { EditorToolbar } from "./EditorToolbar";
import { EditableField } from "./EditableField";
import { PostImage } from "./PostImage";
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
    handleImageUpdate,
    handleContentChange,
    handleSave,
  } = usePostEditor(postId);
  
  const [localPost, setLocalPost] = useState<Post>(post);
  
  // Update local state when post changes
  useEffect(() => {
    setLocalPost(post);
  }, [post]);
  
  // Handle references update
  const handleReferencesUpdate = (path: string, index: number, value: string | ImageData) => {
    if (path === 'references.images' || path === 'references.texts') {
      const [parent, child] = path.split('.');
      const updated = { ...localPost.references };
      updated[child as keyof typeof updated] = [
        ...(updated[child as keyof typeof updated] as string[]).slice(0, index),
        value as string,
        ...(updated[child as keyof typeof updated] as string[]).slice(index + 1)
      ];
      setLocalPost(prev => ({
        ...prev,
        references: updated
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        Carregant...
      </div>
    );
  }

  return (
    <div className="bg-black text-white min-h-screen">
      <EditorToolbar
        loading={loading}
        category={post.category}
        categories={Object.values(CATEGORIES)}
        language={post.language}
        onCategoryChange={(category) => handleFieldChange("category", category)}
        onLanguageChange={(language) => handleFieldChange("language", language)}
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

            </header>



            <PostImage
              image={post.image}
              activeEditField={activeEditField}
              setActiveEditField={setActiveEditField}
              onImageUpdate={handleImageUpdate}
              onImageRemove={() => handleImageUpdate(null)}
            />

            <ContentEditor
              content={post.content}
              contentEditMode={contentEditMode}
              setContentEditMode={setContentEditMode}
              onContentChange={handleContentChange}
            />

            <ReferencesSection
              references={localPost.references}
              activeEditField={activeEditField}
              setActiveEditField={setActiveEditField}
              onArrayAdd={handleArrayAdd}
              onArrayRemove={handleArrayRemove}
              onArrayUpdate={handleReferencesUpdate}
            />

            <KeywordsSection
              keywords={localPost.keywords}
              activeEditField={activeEditField}
              setActiveEditField={setActiveEditField}
              onArrayAdd={handleArrayAdd}
              onArrayRemove={handleArrayRemove}
              onArrayUpdate={(path, index, value) => {
                const newKeywords = [...localPost.keywords];
                newKeywords[index] = value as string;
                setLocalPost(prev => ({
                  ...prev,
                  keywords: newKeywords
                }));
              }}
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
