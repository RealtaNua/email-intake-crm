/**
 * The expand/collapse affordance on a <details> summary.
 *
 * The native disclosure triangle is suppressed globally — at this density it
 * reads as clutter — but suppressing it left a collapsed message with nothing
 * to say it could be opened. This is the explicit replacement: quiet enough to
 * sit in a dense timeline, present enough to be found.
 *
 * Rotation is driven by `group-open:`, so the parent <details> must carry the
 * `group` class. No client JavaScript — <details> already owns the state.
 */
export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={
        "mt-1 h-3 w-3 shrink-0 text-ink-muted transition-transform duration-150 " +
        `group-open:rotate-90 ${className}`
      }
    >
      <path
        d="M4.5 2.5 8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
