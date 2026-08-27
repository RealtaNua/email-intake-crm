/**
 * An outstanding action, shown so it cannot be skimmed past.
 *
 * Red when the ball is in our court on an urgent thread, amber otherwise.
 * Reserving red for "urgent and on us" keeps it meaningful — if everything
 * pending were red, red would stop meaning anything.
 */
export function NextStep({
  text,
  urgent = false,
  className = "",
}: {
  text: string | null | undefined;
  urgent?: boolean;
  className?: string;
}) {
  if (!text || text.trim().toLowerCase() === "none") return null;

  const styles = urgent
    ? "border-red-200 bg-red-50/70 text-red-900"
    : "border-amber-200 bg-amber-50/70 text-amber-900";
  const dot = urgent ? "bg-red-500" : "bg-amber-500";
  const labelStyles = urgent ? "text-red-600" : "text-amber-600";

  return (
    <div className={`rounded-xl border px-4 py-3 ${styles} ${className}`}>
      <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${labelStyles}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
        Next step
      </p>
      <p className="mt-1 font-bold leading-snug">{text}</p>
    </div>
  );
}
