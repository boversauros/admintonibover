import { ImgHTMLAttributes, ReactNode } from 'react';

type AspectRatio = 'square' | '4/3' | 'video' | 'auto';
type HoverEffect = 'opacity' | 'scale' | 'none';

interface ImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'width' | 'height'
> {
  src: string;
  alt: string;
  aspect?: AspectRatio;
  hover?: HoverEffect;
  loading?: 'lazy' | 'eager';
  width?: string;
  height?: string;
  className?: string;
  caption?: ReactNode;
}

export function Image({
  src,
  alt,
  aspect = 'auto',
  hover = 'opacity',
  loading = 'lazy',
  width = 'w-full',
  height = '',
  className = '',
  caption,
  ...rest
}: ImageProps) {
  const aspectClasses = {
    square: 'aspect-square',
    '4/3': 'aspect-4/3',
    video: 'aspect-video',
    auto: '',
  };

  const hoverClasses = {
    opacity: 'group-hover:opacity-90 transition-opacity duration-700',
    scale: 'group-hover:scale-105 transition-transform duration-300',
    none: '',
  };

  const imageClasses =
    `${width} ${height} ${aspectClasses[aspect]} object-cover ${hoverClasses[hover]} ${className}`.trim();
  const overflowClass = hover === 'scale' ? 'overflow-hidden' : '';

  const imageElement = (
    <div className={`group ${overflowClass}`}>
      <img
        src={src}
        alt={alt}
        loading={loading}
        className={imageClasses}
        {...rest}
      />
    </div>
  );

  if (caption) {
    return (
      <figure className="space-y-3">
        {imageElement}
        <figcaption className="text-sm text-muted font-serif italic leading-relaxed">
          {caption}
        </figcaption>
      </figure>
    );
  }

  return imageElement;
}
