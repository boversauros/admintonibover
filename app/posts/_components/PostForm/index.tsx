"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Post, Category, ImageData } from "@/app/_lib/types";
import { usePostEditor } from "@/app/_hooks/usePost";
import { PostFormHeader } from "./PostFormHeader";
import { PostFormSidebar } from "./PostFormSidebar";
import { PostFormTabs } from "./PostFormTabs";
import { ContentTab } from "./tabs/ContentTab";
import { MediaTab } from "./tabs/MediaTab";
import { MetadataTab } from "./tabs/MetadataTab";
import { ReferencesTab } from "./tabs/ReferencesTab";

interface PostFormProps {
  post?: Post;
  categories: Category[];
  onSave: (
    postData: Omit<Post, "id" | "created_at" | "updated_at">
  ) => Promise<void>;
  isLoading?: boolean;
}

export const PostForm: React.FC<PostFormProps> = ({
  post: initialPost,
  categories,
  onSave,
  isLoading = false,
}) => {
  const router = useRouter();
  const {
    post,
    loading,
    updateField,
    addKeyword,
    removeKeyword,
    addReference,
    removeReference,
    getPostForSave,
    updateImage,
    updateThumbnail,
  } = usePostEditor(initialPost);

  const [activeTab, setActiveTab] = useState("content");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!post.title.trim()) {
      alert("El títol és obligatori");
      return;
    }

    setSaving(true);
    try {
      const postData = getPostForSave();
      await onSave(postData);
      router.push("/");
    } catch (error) {
      console.error("Error saving post:", error);
      alert("Error guardant l'article");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "main" | "thumbnail"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);

    const imageData: ImageData = {
      id: Date.now(),
      url: localUrl,
      title: file.name.split(".")[0],
      alt: file.name.split(".")[0],
    };

    if (type === "main") {
      updateImage(imageData);
    } else {
      updateThumbnail(imageData);
    }
  };

  if (loading) {
    return (
      <div className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Carregant...</div>
      </div>
    );
  }

  return (
    <div className="bg-black text-white min-h-screen">
      <PostFormHeader
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        onSave={handleSubmit}
        saving={saving}
        isLoading={false}
      />

      <div className="flex">
        <PostFormSidebar
          visible={sidebarVisible}
          post={post}
          categories={categories}
          onUpdateField={updateField}
          onRemoveKeyword={removeKeyword}
          onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        />

        {/* Main Content */}
        <main
          className={`flex-1 transition-all duration-300 ease-in-out pt-16 ${
            sidebarVisible ? "ml-80" : "ml-0"
          }`}
        >
          <div className="max-w-4xl mx-auto p-6">
            <form id="post-form" onSubmit={handleSubmit}>
              {/* Title Section */}
              <div className="mb-8">
                <input
                  type="text"
                  value={post.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  className="w-full bg-transparent border-none text-3xl font-bold text-white placeholder-gray-500 focus:outline-none resize-none"
                  placeholder="Títol del teu article..."
                  style={{ lineHeight: "1.2" }}
                  required
                />
                <div className="h-px bg-gradient-to-r from-gray-700 via-gray-600 to-transparent mt-4"></div>
              </div>

              {/* Tab Navigation */}
              <PostFormTabs activeTab={activeTab} onTabChange={setActiveTab} />

              {/* Tab Content */}
              <div className="space-y-6">
                {activeTab === "content" && (
                  <ContentTab
                    content={post.content}
                    onContentChange={(content) =>
                      updateField("content", content)
                    }
                  />
                )}

                {activeTab === "media" && (
                  <MediaTab
                    image={post.image}
                    thumbnail={post.thumbnail}
                    onImageChange={updateImage}
                    onThumbnailChange={updateThumbnail}
                    onImageUpload={handleImageUpload}
                  />
                )}
                {activeTab === "meta" && (
                  <MetadataTab
                    keywords={post.keywords}
                    onAddKeyword={addKeyword}
                    onRemoveKeyword={removeKeyword}
                  />
                )}

                {activeTab === "references" && (
                  <ReferencesTab
                    references={post.references}
                    onAddReference={addReference}
                    onRemoveReference={removeReference}
                  />
                )}
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
};
