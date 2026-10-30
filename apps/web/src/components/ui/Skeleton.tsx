export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className="animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--color-ink)_7%,transparent)]">
      <div className={className} />
    </div>
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}
