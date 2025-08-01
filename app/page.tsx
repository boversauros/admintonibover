"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { PostList } from "./posts/_components/PostList";
import { postsService } from "./_lib/posts-service";
import { CATEGORIES } from "./_lib/mock-data";
import { Post } from "./_lib/types";

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    setLoading(true);
    const response = await postsService.getAll();
    if (response.error) {
      setError(response.error);
    } else {
      setPosts(response.data || []);
    }
    setLoading(false);
  };

  const handleTogglePublish = async (postId: number) => {
    const response = await postsService.togglePublish(postId);
    if (response.error) {
      alert(`Error: ${response.error}`);
    } else {
      loadPosts();
    }
  };

  const handleDelete = async (postId: number) => {
    const response = await postsService.delete(postId);
    if (response.error) {
      alert(`Error: ${response.error}`);
    } else {
      loadPosts();
    }
  };

  if (loading) {
    return (
      <div className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Carregant...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="bg-black text-white min-h-screen">
      <main className="pt-32 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex justify-between items-center mb-12">
            <h2 className="text-xl font-serif italic">REFLEXIONS</h2>
            <Link
              href="/posts/new"
              className="flex items-center gap-2 tracking-wide text-gray-300 hover:text-white transition-colors duration-300"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nova reflexió</span>
            </Link>
          </div>

          {posts.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="mb-4">No hi ha articles encara.</p>
              <Link
                href="/posts/new"
                className="inline-flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Crea el primer article</span>
              </Link>
            </div>
          ) : (
            <PostList
              posts={posts}
              categories={CATEGORIES}
              onTogglePublish={handleTogglePublish}
              onDelete={handleDelete}
            />
          )}
        </div>
      </main>
    </div>
  );
}
