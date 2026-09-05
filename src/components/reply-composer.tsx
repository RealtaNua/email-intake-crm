"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ReplyResult } from "@/app/dashboard/actions";

/**
 * Sends a real email, from the intake address, to the contact.
 *
 * Deliberately not a silent submit: the button says what it does, and the
 * recipient is shown next to it. This is the one control in the app that
 * reaches a real person, and it cannot be taken back.
 */
function SendButton({ to }: { to: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reply"}
      </button>
      <span className="text-xs text-ink-muted">
        Sends to <span className="text-ink">{to}</span> and files it in this thread.
      </span>
    </div>
  );
}

export function ReplyComposer({
  to,
  defaultSubject,
  action,
}: {
  to: string;
  defaultSubject: string;
  action: (prev: ReplyResult, formData: FormData) => Promise<ReplyResult>;
}) {
  const [state, formAction] = useActionState<ReplyResult, FormData>(action, {
    status: "idle",
  });

  // Clearing the textarea after a send would otherwise need an effect. Keying
  // the form on the result swaps in a fresh one, which is the same outcome
  // without a second render pass showing the sent text still sitting there.
  const [sendCount, setSendCount] = useState(0);
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.status === "sent") setSendCount((n) => n + 1);
  }

  return (
    <div className="mt-4 rounded-xl bg-page p-4">
      <h3 className="text-sm font-semibold text-ink">Reply</h3>
      <p className="mt-0.5 text-xs text-ink-muted">
        Sent from the intake address, so their answer comes back into this thread.
      </p>

      {state.status === "sent" ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Sent. It will appear in the conversation above.
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.message ?? "Send failed."}
        </p>
      ) : null}

      <form key={sendCount} action={formAction} className="mt-3 space-y-2">
        <input
          name="subject"
          defaultValue={defaultSubject}
          placeholder="Subject"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <textarea
          name="body"
          rows={5}
          required
          placeholder="Write your reply. It goes out as a real email."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <SendButton to={to} />
      </form>
    </div>
  );
}
