'use client';

import { StoredPost } from '@/lib/types/post';
import { StatusBadge, LanguageIndicator, Icon, Button } from '@/components/ui';

interface PostCardProps {
  post: StoredPost;
  categoryLabel: string;
  onEdit: (post: StoredPost) => void;
  onDelete: (post: StoredPost) => void;
}

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
    ? content.slice(0, 120).trim() + (content.length > 120 ? '…' : '')
    : '';
  const keywords = [
    ...(post.translations.ca?.keywords || []),
    ...(post.translations.en?.keywords || []),
  ]
    .filter((kw, idx, arr) => arr.indexOf(kw) === idx)
    .slice(0, 4);

  const thumbnailUrl = post.thumbnail?.url;

  return (
    <article className="group">
      <div className="flex gap-5 py-4 border-b border-overlay-10 hover:bg-overlay-2 transition-colors-smooth">
        {/* Left: Thumbnail */}
        <div className="relative w-48 shrink-0 overflow-hidden bg-overlay-5 self-stretch min-h-[100px]">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon name="image-placeholder" size="8" className="opacity-30" />
            </div>
          )}
        </div>

        {/* Middle: Content */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          {/* Top section */}
          <div>
            {/* Meta row */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-slate-400 text-xs tracking-widest uppercase font-medium">
                {categoryLabel}
              </span>
              <span className="w-px h-3 bg-overlay-20" aria-hidden="true" />
              <LanguageIndicator
                hasCA={!!post.translations.ca?.title}
                hasEN={!!post.translations.en?.title}
              />
              <StatusBadge published={post.is_published} />
            </div>

            {/* Title - clearly clickable with arrow hint */}
            <button
              onClick={() => onEdit(post)}
              className="group/title text-left w-full"
              aria-label={`Edit: ${title}`}
            >
              <h3 className="text-lg font-serif text-primary leading-snug inline">
                {title}
                <Icon
                  name="arrow-right-line"
                  className="inline-block ml-2 opacity-0 -translate-x-1 group-hover/title:opacity-100 group-hover/title:translate-x-0 transition-all-smooth"
                />
              </h3>
            </button>

            {/* Excerpt - improved contrast */}
            {excerpt && (
              <p className="text-sm text-primary-60 leading-relaxed mt-2 line-clamp-2">
                {excerpt}
              </p>
            )}
          </div>

          {/* Keywords - improved contrast */}
          {keywords.length > 0 && (
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-3">
              {keywords.map((kw, i) => (
                <span key={i} className="text-sm text-primary-50 tracking-wide">
                  #{kw}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: Always-visible actions */}
        <div className="flex flex-col justify-center gap-0 shrink-0">
          <Button
            variant="icon"
            onClick={e => {
              e.stopPropagation();
              onEdit(post);
            }}
            aria-label="Edit post"
          >
            <Icon name="edit" />
          </Button>
          <Button
            variant="icon"
            onClick={e => {
              e.stopPropagation();
              onDelete(post);
            }}
            className="hover:text-red-400 hover:bg-red-500/10"
            aria-label="Delete post"
          >
            <Icon name="trash" />
          </Button>
        </div>
      </div>
    </article>
  );
}
