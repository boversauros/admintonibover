'use client';

import type { AdminPostSummary } from '@/lib/api/adminReads';
import {
  StatusBadge,
  LanguageIndicator,
  Icon,
  Button,
  Image,
  Text,
  Heading,
} from '@/components/ui';

interface PostCardProps {
  post: AdminPostSummary;
  categoryLabel: string;
  onEdit: (postId: string) => void;
  onDelete?: (post: AdminPostSummary) => void;
}

export function PostCard({
  post,
  categoryLabel,
  onEdit,
  onDelete,
}: PostCardProps) {
  const title = post.titles.ca || post.titles.en;
  const content = post.excerpts.ca || post.excerpts.en;
  const excerpt = content
    ? content.slice(0, 120).trim() + (content.length > 120 ? '…' : '')
    : '';
  const keywords = [...post.keywords.ca, ...post.keywords.en]
    .filter((kw, idx, arr) => arr.indexOf(kw) === idx)
    .slice(0, 4);

  const thumbnailUrl = post.thumbnailUrl;

  return (
    <article className="group">
      <div className="flex gap-5 py-4 border-b border-overlay-10 hover:bg-overlay-2 transition-colors-smooth">
        {/* Left: Thumbnail */}
        <div className="relative w-48 shrink-0 overflow-hidden bg-overlay-5 self-stretch min-h-[100px]">
          {thumbnailUrl ? (
            <Image
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
              <Text
                as="span"
                variant="small"
                className="text-slate-400 text-xs tracking-widest uppercase font-medium"
              >
                {categoryLabel}
              </Text>
              <Text
                as="span"
                className="w-px h-3 bg-overlay-20"
                aria-hidden="true"
              >
                {' '}
              </Text>
              <LanguageIndicator
                hasCA={!!post.titles.ca}
                hasEN={!!post.titles.en}
              />
              <StatusBadge published={post.published} />
            </div>

            {/* Title - clearly clickable with arrow hint */}

            <Heading
              as="h3"
              size="xl"
              className="text-lg font-serif text-primary leading-snug inline mb-0"
            >
              <span className="text-primary tabular-nums">
                {post.sortOrder}
              </span>
              <span className="text-primary-30 mx-1.5" aria-hidden="true">
                ·
              </span>
              {title}
            </Heading>

            {/* Excerpt - improved contrast */}
            {excerpt && (
              <Text
                variant="small"
                className="text-primary-60 leading-relaxed mt-2 line-clamp-2"
              >
                {excerpt}
              </Text>
            )}
          </div>

          {/* Keywords - improved contrast */}
          {keywords.length > 0 && (
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-3">
              {keywords.map((kw, i) => (
                <Text
                  key={i}
                  as="span"
                  variant="small"
                  className="text-primary-50 tracking-wide font-serif"
                >
                  {kw}
                </Text>
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
              onEdit(post.id);
            }}
            aria-label="Edit post"
          >
            <Icon name="edit" />
          </Button>
          {onDelete ? (
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
          ) : null}
        </div>
      </div>
    </article>
  );
}
