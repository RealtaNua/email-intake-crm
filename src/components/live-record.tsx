"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps one contact record current without a manual refresh.
 *
 * Two things land on this page after the fact and neither is user-initiated:
 * a reply captured from your mail client via the BCC path, and the triage that
 * runs in after() once a Claude call finishes — thirty to ninety seconds
 * behind the row it belongs to. Both used to require knowing to press reload,
 * and reloading too early shows a blank pending row, which reads as broken.
 *
 * Realtime is the primary mechanism; polling is the fallback, because a
 * subscription that silently fails to connect would leave the page frozen with
 * nothing on screen to say so. Realtime respects RLS, so this subscribes with
 * the anon key to exactly what the dashboard can already read.
 */
const POLL_MS = 5000;

export function LiveRecord({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let connected = false;

    const channel = supabase
      .channel(`contact:${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "enquiries",
          filter: `contact_id=eq.${contactId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "contacts",
          filter: `id=eq.${contactId}`,
        },
        () => router.refresh(),
      )
      .subscribe((status) => {
        connected = status === "SUBSCRIBED";
        setLive(connected);
      });

    // Runs regardless. When realtime is connected this is a cheap no-op safety
    // net; when it is not — publication missing, socket blocked — it is the
    // only thing keeping the page current.
    const poll = setInterval(() => {
      if (!connected && document.visibilityState === "visible") router.refresh();
    }, POLL_MS);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
    // The app router's instance is stable, so this subscribes once per contact.
  }, [contactId, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/70">
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-300" : "bg-white/40"}`}
        aria-hidden="true"
      />
      {live ? "Live" : "Checking every 5s"}
    </span>
  );
}
