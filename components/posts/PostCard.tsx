"use client";

import { StoredPost } from "@/lib/types/post";
import { StatusBadge, LanguageIndicator } from "@/components/ui";

interface PostCardProps {
  post: StoredPost;
  categoryLabel: string;
  onEdit: (post: StoredPost) => void;
  onDelete: (post: StoredPost) => void;
}

const EditIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const TrashIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <polyline points="3,6 5,6 21,6" />
    <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
  </svg>
);

const ImagePlaceholder = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    className="opacity-20"
  >
    <rect x="3" y="3" width="18" height="18" rx="0" ry="0" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21,15 16,10 5,21" />
  </svg>
);

export function PostCard({
  post,
  categoryLabel,
  onEdit,
  onDelete,
}: PostCardProps) {
  const title = post.translations.ca?.title || post.translations.en?.title;
  const content =
    post.translations.ca?.content || post.translations.en?.content;
  const excerpt = content
    ? content.slice(0, 140).trim() + (content.length > 140 ? "…" : "")
    : "";
  const keywords = [
    ...(post.translations.ca?.keywords || []),
    ...(post.translations.en?.keywords || []),
  ]
    .filter((kw, idx, arr) => arr.indexOf(kw) === idx)
    .slice(0, 4);

  const thumbnailUrl = post.thumbnail?.url;

  return (
    <article className="group relative">
      <div className="flex gap-6 py-6 border-b border-white/6">
        {/* Left: Thumbnail with action overlay */}
        <div className="relative w-44 h-28 shrink-0 overflow-hidden bg-white/2 group/image">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImagePlaceholder />
            </div>
          )}

          {/* Actions overlay - appears on card hover */}
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(post);
              }}
              className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
              title="Editar"
            >
              <EditIcon />
            </button>
            <span className="w-px h-5 bg-white/20" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(post);
              }}
              className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-red-400 transition-all duration-200"
              title="Eliminar"
            >
              <TrashIcon />
            </button>
          </div>
        </div>

        {/* Right: Content */}
        <div className="flex-1 flex flex-col justify-between min-h-[112px]">
          {/* Top section */}
          <div>
            {/* Meta row */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-slate-400 text-[11px] tracking-[0.15em] uppercase font-medium">
                {categoryLabel}
              </span>
              <span className="w-px h-3 bg-white/10" />
              <LanguageIndicator
                hasCA={!!post.translations.ca?.title}
                hasEN={!!post.translations.en?.title}
              />
              <div className="flex-1" />
              <StatusBadge published={post.is_published} />
            </div>

            {/* Title - clickable */}
            <h3
              onClick={() => onEdit(post)}
              className="text-xl font-serif text-white/90 leading-snug mb-2 cursor-pointer hover:text-white transition-colors duration-200"
            >
              {title}
            </h3>

            {/* Excerpt */}
            {excerpt && (
              <p className="text-sm text-white/35 leading-relaxed line-clamp-2">
                {excerpt}
              </p>
            )}
          </div>

          {/* Keywords */}
          {keywords.length > 0 && (
            <div className="flex items-center gap-2 mt-4">
              {keywords.map((kw, i) => (
                <span
                  key={i}
                  className="text-xs text-white/40 tracking-wide hover:text-white/60 transition-colors cursor-default"
                >
                  #{kw}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
