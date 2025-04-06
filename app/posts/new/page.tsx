"use client";

import React from "react";
import PostEditor from "./components/PostEditor";
import { useSearchParams } from "next/navigation";

export default function NewPostPage() {
  const searchParams = useSearchParams();
  const postId = searchParams.get("id") || undefined;

  return <PostEditor postId={postId} />;
}
