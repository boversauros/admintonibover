"use client";
import { useParams } from "next/navigation";
import { PostFormV2 } from "../../_components/PostFormV2";
import { CATEGORIES_V2 } from "@/app/_lib/mock-data-v2";

export default function EditPostPage() {
  const params = useParams();
  const postId = Number(params.id);

  if (!postId || isNaN(postId)) {
    return (
      <div className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">ID d'article invàlid</p>
          <a href="/" className="text-gray-300 hover:text-white underline">
            Tornar a l'inici
          </a>
        </div>
      </div>
    );
  }

  return <PostFormV2 postId={postId} categories={CATEGORIES_V2} />;
}
