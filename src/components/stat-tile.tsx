/** A headline number with its label, for the row above a list. */
export function StatTile({
  label,
  value,
  hint,
  accent = "slate",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "slate" | "red" | "amber" | "emerald" | "brand";
}) {
  const accents: Record<string, string> = {
    slate: "text-ink",
    red: "text-red-600",
    amber: "text-amber-600",
    emerald: "text-emerald-600",
    brand: "text-brand",
  };
  const bars: Record<string, string> = {
    slate: "bg-slate-300",
    red: "bg-red-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    brand: "bg-brand",
  };

  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-1.5 text-3xl font-semibold tabular-nums ${accents[accent]}`}>{value}</p>
      <div className={`mt-3 h-1 w-10 rounded-full ${bars[accent]}`} />
      {hint ? <p className="mt-2 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
