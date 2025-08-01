"use client";
import { PostForm } from "../_components/PostForm";
import { postsService } from "@/app/_lib/posts-service";
import { CATEGORIES, DEMO_USER } from "@/app/_lib/mock-data";
import { Post } from "@/app/_lib/types";

export default function NewPostPage() {
  const handleSave = async (
    postData: Omit<Post, "id" | "created_at" | "updated_at">
  ) => {
    const dataWithUser = {
      ...postData,
      user_id: postData.user_id || DEMO_USER.id,
    };

    const response = await postsService.create(dataWithUser);
    if (response.error) {
      throw new Error(response.error);
    }
  };

  return <PostForm categories={CATEGORIES} onSave={handleSave} />;
}
