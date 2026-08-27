type Tone = "red" | "orange" | "sky" | "slate" | "emerald" | "amber" | "violet";

const TONES: Record<Tone, string> = {
  red: "bg-red-50 text-red-700 ring-red-100",
  orange: "bg-orange-50 text-orange-700 ring-orange-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  sky: "bg-sky-50 text-sky-700 ring-sky-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** Soft tinted pill. Tone carries the meaning, so it is always explicit. */
export function Badge({
  tone = "slate",
  children,
  uppercase = false,
}: {
  tone?: Tone;
  children: React.ReactNode;
  uppercase?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        TONES[tone]
      } ${uppercase ? "uppercase tracking-wide" : ""}`}
    >
      {children}
    </span>
  );
}

export const PRIORITY_TONE: Record<string, Tone> = {
  urgent: "red",
  high: "orange",
  normal: "sky",
  low: "slate",
};

export const CONVERSATION_TONE: Record<string, Tone> = {
  awaiting_our_reply: "amber",
  awaiting_their_reply: "slate",
  scheduled: "sky",
  closed_won: "emerald",
  closed_lost: "slate",
  no_action_needed: "slate",
};
