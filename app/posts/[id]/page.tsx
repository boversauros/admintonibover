"use client";
import { useEffect, useState } from "react";
import { useParams, notFound } from "next/navigation";
import { PostView } from "../_components/PostView";
import { postsServiceV2 } from "@/app/_lib/posts-service-v2";
import { CATEGORIES_V2 } from "@/app/_lib/mock-data-v2";
import { PostV2, PostTranslationV2, CategoryV2 } from "@/app/_lib/types-v2";

export default function ViewPostPage() {
  const params = useParams();
  const postId = Number(params.id);

  const [post, setPost] = useState<PostV2 | null>(null);
  const [translations, setTranslations] = useState<PostTranslationV2[]>([]);
  const [category, setCategory] = useState<CategoryV2 | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!postId || isNaN(postId)) {
      notFound();
      return;
    }

    loadPost();
  }, [postId]);

  const loadPost = async () => {
    setLoading(true);
    const response = await postsServiceV2.getById(postId);

    if (response.error || !response.data) {
      setError(response.error || "Post not found");
      setLoading(false);
      return;
    }

    setPost(response.data.post);
    setTranslations(response.data.translations);
    setCategory(
      CATEGORIES_V2.find((c) => c.id === response.data!.post.category_id)
    );
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Carregant...</div>
      </div>
    );
  }

  if (error || !post || translations.length === 0) {
    return (
      <div className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || "Article no trobat"}</p>
          <a href="/" className="text-gray-300 hover:text-white underline">
            Tornar a l'inici
          </a>
        </div>
      </div>
    );
  }

  return (
    <PostView post={post} translations={translations} category={category} />
  );
}
