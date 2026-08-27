"use client";

import { useEffect, useState } from "react";

type Variant = "datetime" | "date" | "relative";

/**
 * Renders a timestamp in the *reader's* timezone.
 *
 * Server components render in the server's timezone (UTC on Vercel), so
 * formatting a date there shows the wrong wall-clock time to everyone. It has
 * to happen in the browser.
 *
 * The naive version of that causes a hydration mismatch: the server emits one
 * string, the client computes another, React complains and may keep the wrong
 * one. So the first client render deliberately matches the server exactly —
 * both produce the UTC form — and the local value is applied in an effect,
 * after hydration has already succeeded.
 *
 * The `title` carries the full timestamp with its zone, so hovering answers
 * "which timezone is this?" without guessing.
 */
export function LocalTime({
  iso,
  variant = "datetime",
  className,
}: {
  iso: string;
  variant?: Variant;
  className?: string;
}) {
  const [local, setLocal] = useState<{ text: string; title: string } | null>(null);

  useEffect(() => {
    // The linter flags setState inside an effect because it usually means
    // derived state that belongs in render. This is the other case the rule
    // describes as legitimate: reading from an external system — the browser's
    // own timezone, which does not exist during server rendering.
    //
    // It cannot move into render: the first client render has to match the
    // server's output byte for byte or hydration fails, which is the entire
    // problem this component exists to solve.
    const date = new Date(iso);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal({ text: format(date, variant), title: fullTitle(date) });
  }, [iso, variant]);

  const fallback = formatUTC(new Date(iso), variant);

  return (
    <time dateTime={iso} title={local?.title ?? `${fallback} UTC`} className={className}>
      {local?.text ?? fallback}
    </time>
  );
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

function format(date: Date, variant: Variant): string {
  if (variant === "relative") return relative(date);
  if (variant === "date") return date.toLocaleDateString(undefined, DATE_OPTS);
  // Same-day messages are common in a thread, so the time is not optional.
  return `${date.toLocaleDateString(undefined, DATE_OPTS)}, ${date.toLocaleTimeString(undefined, TIME_OPTS)}`;
}

/** Must be byte-identical between server and first client render. */
function formatUTC(date: Date, variant: Variant): string {
  if (variant === "relative") return relative(date);
  const d = date.toLocaleDateString("en-GB", { ...DATE_OPTS, timeZone: "UTC" });
  if (variant === "date") return d;
  return `${d}, ${date.toLocaleTimeString("en-GB", { ...TIME_OPTS, timeZone: "UTC", hour12: false })}`;
}

function fullTitle(date: Date): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${date.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit",
  })} (${zone})`;
}

/** Timezone-independent, so it is safe to compute identically on both sides. */
function relative(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
