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
    width="16"
    height="16"
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
    width="16"
    height="16"
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
    strokeWidth="1.5"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
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
  const keywords = [
    ...(post.translations.ca?.keywords || []),
    ...(post.translations.en?.keywords || []),
  ]
    .filter((kw, idx, arr) => arr.indexOf(kw) === idx)
    .slice(0, 3);

  const thumbnailUrl = post.thumbnail?.url;

  return (
    <article className="group relative bg-surface border border-default hover:border-subtle transition-all duration-300">
      <div className="flex">
        {/* Thumbnail */}
        <div className="relative w-48 h-36 shrink-0 overflow-hidden bg-surface">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted">
              <ImagePlaceholder />
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-r from-transparent to-surface/50" />
        </div>

        {/* Content */}
        <div className="flex-1 p-5 flex flex-col justify-between">
          <div>
            {/* Meta row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <LanguageIndicator
                  hasCA={!!post.translations.ca?.title}
                  hasEN={!!post.translations.en?.title}
                />
                <span className="text-muted text-xs">·</span>
                <span className="text-accent text-xs tracking-widest uppercase font-medium">
                  {categoryLabel}
                </span>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-lg font-serif text-primary mb-2 group-hover:text-accent transition-colors">
              {title}
            </h3>

            {/* Keywords */}
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="text-[10px] text-muted bg-white/5 px-2 py-0.5"
                  >
                    #{kw}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-subtle">
            <StatusBadge published={post.is_published} />
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(post)}
                className="p-2 text-muted hover:text-primary hover:bg-white/5 transition-colors"
              >
                <EditIcon />
              </button>
              <button
                onClick={() => onDelete(post)}
                className="p-2 text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
