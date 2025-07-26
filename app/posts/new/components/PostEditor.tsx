import { useState } from "react";
import { CATEGORIES } from "../../../../data";
import { usePostEditor } from "../../hooks/usePostEditor";
import { Post } from "../../../../types";

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
  const [activeEditField, setActiveEditField] = useState<string | null>(null);
  const [contentEditMode, setContentEditMode] = useState<boolean>(false);

  const {
    post,
    loading,
    updateField,
    updateImage,
    updateThumbnail,
    addKeyword,
    removeKeyword,
    addReference,
    removeReference,
    updateReferences,
    getPostForSupabase
  } = usePostEditor(postId ? { id: postId } : undefined);

  // Handle field changes with proper type safety
  const handleFieldChange = (field: string, value: string) => {
    updateField(field as keyof Post, value);
  };

  // Handle saving the post
  const handleSave = async () => {
    try {
      const postToSave = getPostForSupabase();
      console.log('Saving post:', postToSave);
      
      // TODO: Uncomment and implement Supabase save logic
      // const { data, error } = await supabase
      //   .from('posts')
      //   .upsert(postToSave);
      // 
      // if (error) throw error;
      
      alert('Post saved successfully!');
    } catch (error) {
      console.error('Error saving post:', error);
      alert('Failed to save post. Please try again.');
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
              image={post.image || null}
              activeEditField={activeEditField}
              setActiveEditField={setActiveEditField}
              onImageUpdate={updateImage}
              onImageRemove={() => updateImage(null)}
            />

            <div className="mt-8">
              <h2 className="text-xl font-serif mb-4 text-gray-200">Contingut</h2>
              <ContentEditor
                content={post.content || "<p>Fes clic per editar el contingut...</p>"}
                contentEditMode={contentEditMode}
                setContentEditMode={setContentEditMode}
                onContentChange={(content) => updateField('content', content)}
              />
            </div>

            <ReferencesSection
              references={post.references}
              activeEditField={activeEditField}
              setActiveEditField={setActiveEditField}
              onAddReference={addReference}
              onRemoveReference={removeReference}
              onUpdateReferences={(type, updatedReferences) => {
                updateField('references', {
                  ...post.references,
                  [type]: updatedReferences
                });
              }}
            />

            <KeywordsSection
              keywords={post.keywords}
              activeEditField={activeEditField}
              setActiveEditField={setActiveEditField}
              onAddKeyword={addKeyword}
              onRemoveKeyword={removeKeyword}
              onUpdateKeyword={(index, value) => {
                const newKeywords = [...post.keywords];
                newKeywords[index] = value;
                updateField('keywords', newKeywords);
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
