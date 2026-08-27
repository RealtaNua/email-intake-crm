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
    ? "border-red-300 bg-red-50 text-red-900"
    : "border-amber-300 bg-amber-50 text-amber-900";
  const labelStyles = urgent ? "text-red-700" : "text-amber-700";

  return (
    <div className={`rounded-lg border-l-4 px-4 py-3 ${styles} ${className}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${labelStyles}`}>
        Next step
      </p>
      <p className="mt-1 font-bold">{text}</p>
    </div>
  );
}
