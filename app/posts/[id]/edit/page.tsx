"use client";
import { useEffect, useState } from "react";
import { useParams, notFound } from "next/navigation";
import { PostForm } from "../../_components/PostForm";
import { postsService } from "@/app/_lib/posts-service";
import { CATEGORIES } from "@/app/_lib/mock-data";
import { Post } from "@/app/_lib/types";

export default function EditPostPage() {
  const params = useParams();
  const postId = Number(params.id);

  const [post, setPost] = useState<Post | null>(null);
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
    const response = await postsService.getById(postId);

    if (response.error || !response.data) {
      setError(response.error || "Post not found");
      setLoading(false);
      return;
    }

    setPost(response.data);
    setLoading(false);
  };

  const handleSave = async (
    postData: Omit<Post, "id" | "created_at" | "updated_at">
  ) => {
    const response = await postsService.update(postId, postData);
    if (response.error) {
      throw new Error(response.error);
    }
  };

  if (loading) {
    return (
      <div className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Carregant...</div>
      </div>
    );
  }

  if (error || !post) {
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

  return <PostForm post={post} categories={CATEGORIES} onSave={handleSave} />;
}
