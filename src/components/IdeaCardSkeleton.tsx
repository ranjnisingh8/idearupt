const IdeaCardSkeleton = () => (
  <div className="surface-card p-3.5 sm:p-6 space-y-4" style={{ transform: 'none' }}>
    {/* Top: badges */}
    <div className="flex items-center gap-2">
      <div className="h-5 w-14 rounded-md skeleton-shimmer" />
      <div className="h-5 w-20 rounded-md skeleton-shimmer" />
      <div className="h-5 w-16 rounded-md skeleton-shimmer" />
    </div>
    {/* Title + description */}
    <div className="space-y-2">
      <div className="h-5 w-4/5 rounded-md skeleton-shimmer" />
      <div className="h-4 w-full rounded-md skeleton-shimmer" />
      <div className="h-4 w-3/5 rounded-md skeleton-shimmer" />
    </div>
    {/* Mini score bars */}
    <div className="flex gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex-1 space-y-1.5">
          <div className="h-2 w-10 rounded skeleton-shimmer" />
          <div className="h-1.5 w-full rounded-full skeleton-shimmer" />
        </div>
      ))}
    </div>
    {/* Meta pills */}
    <div className="flex gap-2">
      <div className="h-5 w-20 rounded-md skeleton-shimmer" />
      <div className="h-5 w-16 rounded-md skeleton-shimmer" />
      <div className="h-5 w-24 rounded-md skeleton-shimmer" />
    </div>
    {/* Gradient divider */}
    <div className="divider-gradient" />
    {/* Bottom row */}
    <div className="flex items-center justify-between pt-1">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full skeleton-shimmer" />
        <div className="flex gap-2">
          <div className="w-8 h-8 rounded-lg skeleton-shimmer" />
          <div className="w-8 h-8 rounded-lg skeleton-shimmer" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="h-4 w-12 rounded skeleton-shimmer" />
        <div className="h-4 w-10 rounded skeleton-shimmer" />
      </div>
    </div>
  </div>
);

export default IdeaCardSkeleton;
