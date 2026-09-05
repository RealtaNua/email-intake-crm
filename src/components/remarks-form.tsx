"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { RemarksResult } from "@/app/dashboard/actions";

/**
 * Human-written remarks: shown as a record first, edited second.
 *
 * Two things this exists to prevent. A submit with no visible outcome — the
 * save worked, but nothing on screen said so, which is the same experience as
 * a save that failed. And a value that only ever appears inside the textarea
 * that wrote it, so what is on file reads as an unsaved draft.
 */
function SaveButton() {
  // useFormStatus, not a hand-rolled flag: a rejected action clears pending on
  // its own, which a manual boolean does not (gotcha 2).
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save remarks"}
    </button>
  );
}

export function RemarksForm({
  remarks,
  action,
}: {
  remarks: string | null;
  action: (prev: RemarksResult, formData: FormData) => Promise<RemarksResult>;
}) {
  const [state, formAction] = useActionState<RemarksResult, FormData>(action, {
    status: "idle",
  });
  const [editing, setEditing] = useState(!remarks);

  // A successful save closes the editor. Adjusted during render off a changed
  // action result rather than in an effect — an effect here would render the
  // stale editor once before collapsing it.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.status === "saved") setEditing(false);
  }

  // Stays up until the next edit. Nothing else on the page changes visibly when
  // the text is unchanged, so a confirmation that vanishes can be missed.
  const justSaved = state.status === "saved" && !editing;

  return (
    <section className="card mt-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Special remarks</h2>
        {justSaved ? (
          <span className="text-xs font-medium text-emerald-600">Saved</span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Yours. Never written or overwritten by the model.
      </p>

      {state.status === "error" ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          Not saved — {state.message ?? "something went wrong."}
        </p>
      ) : null}

      {editing ? (
        <form action={formAction} className="mt-3">
          <textarea
            name="remarks"
            rows={3}
            defaultValue={remarks ?? ""}
            placeholder="Anything worth knowing before you reply — preferences, history, sensitivities."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
          <div className="mt-2 flex items-center gap-2">
            <SaveButton />
            {remarks ? (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-sm font-medium text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : remarks ? (
        <>
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-violet-50/70 px-4 py-3 text-sm leading-relaxed text-ink">
            {remarks}
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 text-sm font-medium text-brand hover:text-brand-deep"
          >
            Edit
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-muted">None recorded.</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 text-sm font-medium text-brand hover:text-brand-deep"
          >
            Add remarks
          </button>
        </>
      )}
    </section>
  );
}
