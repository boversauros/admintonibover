interface StatusBadgeProps {
  published: boolean;
}

export function StatusBadge({ published }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs tracking-wide uppercase border ${
        published
          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
          : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          published ? 'bg-emerald-400' : 'bg-amber-400'
        }`}
      />
      {published ? 'Publicat' : 'Esborrany'}
    </span>
  );
}
