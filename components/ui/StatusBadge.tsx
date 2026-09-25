import { Badge } from './Badge';

interface StatusBadgeProps {
  published: boolean;
}

export function StatusBadge({ published }: StatusBadgeProps) {
  return (
    <Badge tone={published ? 'success' : 'warning'} size="md">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          published ? 'bg-success' : 'bg-warning animate-pulse'
        }`}
      />
      {published ? 'Publicat' : 'Esborrany'}
    </Badge>
  );
}
