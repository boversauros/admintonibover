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
    width="14"
    height="14"
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
    width="14"
    height="14"
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
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    className="opacity-30"
  >
    <rect x="3" y="3" width="18" height="18" rx="0" ry="0" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21,15 16,10 5,21" />
  </svg>
);

const ArrowIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    className="transition-transform duration-300 group-hover:translate-x-1"
  >
    <path d="M5 12h14M12 5l7 7-7 7" />
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
    ? content.slice(0, 120).trim() + (content.length > 120 ? "..." : "")
    : "";
  const keywords = [
    ...(post.translations.ca?.keywords || []),
    ...(post.translations.en?.keywords || []),
  ]
    .filter((kw, idx, arr) => arr.indexOf(kw) === idx)
    .slice(0, 3);

  const thumbnailUrl = post.thumbnail?.url;
  const formattedDate = post.date
    ? new Date(post.date)
        .toLocaleDateString("ca-ES", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .toUpperCase()
    : "";

  return (
    <article className="group relative border-b border-white/6 hover:bg-white/2 transition-colors duration-500">
      <div className="flex gap-8 py-8">
        {/* Left: Content */}
        <div className="flex-1 flex flex-col justify-between min-h-[140px]">
          {/* Top Meta */}
          <div>
            <div className="flex items-center gap-4 mb-4">
              <span className="text-slate-400 text-[11px] tracking-[0.2em] uppercase font-medium">
                {categoryLabel}
              </span>
              <span className="w-px h-3 bg-white/10" />
              <span className="text-white/30 text-[11px] tracking-wider">
                {formattedDate}
              </span>
              <span className="w-px h-3 bg-white/10" />
              <LanguageIndicator
                hasCA={!!post.translations.ca?.title}
                hasEN={!!post.translations.en?.title}
              />
            </div>

            {/* Title */}
            <h3 className="text-[22px] font-serif text-white/90 leading-tight mb-3 group-hover:text-white transition-colors duration-300">
              {title}
            </h3>

            {/* Excerpt */}
            {excerpt && (
              <p className="text-sm text-white/40 leading-relaxed max-w-xl line-clamp-2">
                {excerpt}
              </p>
            )}
          </div>

          {/* Bottom: Keywords + Actions */}
          <div className="flex items-end justify-between mt-6">
            <div className="flex items-center gap-6">
              <StatusBadge published={post.is_published} />

              {keywords.length > 0 && (
                <div className="flex items-center gap-2">
                  {keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="text-[10px] text-white/25 tracking-wide"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(post);
                }}
                className="p-2.5 text-white/30 hover:text-white hover:bg-white/5 transition-all duration-200"
                title="Editar"
              >
                <EditIcon />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(post);
                }}
                className="p-2.5 text-white/30 hover:text-red-400 hover:bg-red-500/5 transition-all duration-200"
                title="Eliminar"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Thumbnail */}
        <div
          onClick={() => onEdit(post)}
          className="relative w-52 h-36 shrink-0 overflow-hidden bg-white/2 cursor-pointer group/thumb"
        >
          {thumbnailUrl ? (
            <>
              <img
                src={thumbnailUrl}
                alt=""
                className="w-full h-full object-cover opacity-70 group-hover/thumb:opacity-90 group-hover/thumb:scale-[1.02] transition-all duration-700"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-500" />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImagePlaceholder />
            </div>
          )}

          {/* Edit overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-300">
            <div className="flex items-center gap-2 text-white/80 text-xs tracking-wide">
              <span>EDITAR</span>
              <ArrowIcon />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
