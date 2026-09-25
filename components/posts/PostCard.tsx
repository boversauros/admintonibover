'use client';

import type { AdminPostSummary } from '@/lib/api/adminReads';
import { imageInventoryStatus } from '@/lib/domain/media/contracts';
import {
  Badge,
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
  const inventoryStatus = imageInventoryStatus({
    mainImage: post.mainImageKey,
    thumbImage: post.thumbnailKey,
  });
  const inventoryLabel = {
    complete: 'Imatges completes',
    'missing-main': 'Falta la destacada',
    'missing-thumbnail': 'Falta la miniatura',
    'missing-both': 'Falten totes dues',
  }[inventoryStatus];

  return (
    <article className="group">
      <div className="flex gap-5 py-4 border-b border-default hover:bg-overlay-2 transition-colors">
        {/* Left: Thumbnail */}
        <div className="relative min-h-[100px] w-28 shrink-0 self-stretch overflow-hidden bg-overlay-5 sm:w-48">
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : post.thumbnailKey ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
              <Icon name="image" size="6" className="opacity-40" />
              <Text variant="small" className="text-xs text-subtle">
                Miniatura disponible
              </Text>
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-warning/30 px-3 text-center">
              <Icon
                name="image-placeholder"
                size="8"
                className="text-warning"
              />
              <Text variant="small" className="text-xs text-body">
                Falta la miniatura
              </Text>
            </div>
          )}
        </div>

        {/* Middle: Content */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          {/* Top section */}
          <div>
            {/* Meta row */}
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <Text
                as="span"
                variant="small"
                className="text-muted text-xs tracking-wider uppercase"
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
              <Badge
                tone={inventoryStatus === 'complete' ? 'success' : 'warning'}
                size="md"
              >
                {inventoryLabel}
              </Badge>
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
              <span className="text-subtle mx-1.5" aria-hidden="true">
                ·
              </span>
              {title}
            </Heading>

            {/* Excerpt - improved contrast */}
            {excerpt && (
              <Text
                variant="small"
                className="text-primary/60 leading-relaxed mt-2 line-clamp-2"
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
                  className="text-subtle tracking-wide font-serif"
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
            aria-label={`Edita ${title}`}
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
              className="hover:text-danger hover:bg-danger/10"
              aria-label={`Elimina ${title}`}
            >
              <Icon name="trash" />
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
