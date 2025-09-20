"use client";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { PostListItemV2, CategoryV2 } from "@/app/_lib/types-v2";
import { Eye, EyeOff, Edit, Trash, Image as ImageIcon } from "lucide-react";

interface PostListProps {
  posts: PostListItemV2[];
  categories: CategoryV2[];
  onTogglePublish: (postId: number) => void;
  onDelete: (postId: number) => void;
}

export const PostList: React.FC<PostListProps> = ({
  posts,
  categories,
  onTogglePublish,
  onDelete,
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<number | null>(
    null
  );

  const getCategoryName = (categoryId: number) => {
    return categories.find((c) => c.id === categoryId)?.name || "Unknown";
  };

  const getLanguageIndicators = (post: PostListItemV2) => {
    // Show both EN and CA badges, marking active languages
    const primaryLanguage = post.default_translation?.language || "ca";
    const hasTranslations = post.translation_count > 1;

    const languages = ["en", "ca"] as const;
    const indicators: React.ReactNode[] = [];

    languages.forEach((lang) => {
      const isActive =
        lang === primaryLanguage ||
        (hasTranslations && lang !== primaryLanguage);

      indicators.push(
        <span
          key={lang}
          className={`px-2 py-1 text-xs rounded font-medium ${
            isActive
              ? "bg-transparent text-gray-200 border border-gray-600"
              : "bg-transparent text-gray-500 border border-gray-700/30"
          }`}
        >
          {lang.toUpperCase()}
        </span>
      );
    });

    return indicators;
  };

  const handleDelete = (postId: number) => {
    onDelete(postId);
    setDeleteConfirmId(null);
  };

  return (
    <div className="overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white">
            <th className="text-left p-4 text-gray-400 font-normal">
              Miniatura
            </th>
            <th className="text-left p-4 text-gray-400 font-normal">Títol</th>
            <th className="text-left p-4 text-gray-400 font-normal">
              Categoria
            </th>
            <th className="text-left p-4 text-gray-400 font-normal">Idiomes</th>
            <th className="text-left p-4 text-gray-400 font-normal">Estat</th>
            <th className="p-4 text-gray-400 font-normal"></th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <React.Fragment key={post.id}>
              <tr className="border-b border-gray-700">
                <td className="p-2">
                  <div className="w-16 h-16 bg-gray-800 rounded overflow-hidden flex items-center justify-center">
                    {post.thumbnail ? (
                      <Image
                        src={post.thumbnail.url}
                        alt={post.thumbnail.alt || post.thumbnail.title}
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-gray-500 text-xs text-center p-2">
                        <ImageIcon className="w-4 h-4 mx-auto mb-1" />
                        <span>No image</span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <Link
                    href={`/posts/${post.id}`}
                    className="text-gray-300 hover:text-white transition-colors"
                  >
                    {post.default_translation?.title || "Untitled"}
                  </Link>
                </td>
                <td className="p-4 text-gray-300">
                  {getCategoryName(post.category_id)}
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    {getLanguageIndicators(post)}
                  </div>
                </td>
                <td className="p-4">
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      post.is_published
                        ? "bg-green-900 text-green-300"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {post.is_published ? "Publicat" : "Esborrany"}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => onTogglePublish(post.id)}
                      className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
                      title={post.is_published ? "Despublicar" : "Publicar"}
                    >
                      {post.is_published ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    <Link
                      href={`/posts/${post.id}/edit`}
                      className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => setDeleteConfirmId(post.id)}
                      className="p-1.5 rounded hover:bg-gray-700 text-red-400 hover:text-red-300 transition-colors"
                      title="Eliminar"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>

              {deleteConfirmId === post.id && (
                <tr className="bg-gray-900">
                  <td colSpan={7} className="p-4">
                    <div className="flex justify-between items-center">
                      <p className="text-gray-300">
                        Segur que vols eliminar "
                        {post.default_translation?.title || "Untitled"}"?
                        Aquesta acció no es pot desfer.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                        >
                          Cancel·lar
                        </button>
                        <button
                          onClick={() => handleDelete(post.id)}
                          className="px-3 py-1.5 text-sm bg-red-900 hover:bg-red-800 text-red-100 rounded"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};
