"use client";
import { PostFormV2 } from "../_components/PostFormV2";
import { CATEGORIES_V2 } from "@/app/_lib/mock-data-v2";

export default function NewPostPage() {
  return <PostFormV2 categories={CATEGORIES_V2} />;
}
