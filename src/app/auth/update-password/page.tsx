"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Where a password-recovery link lands, via /auth/callback.
 *
 * The recovery link is a one-time sign-in: by the time this page renders the
 * callback has already exchanged the code for a session, so the visitor is
 * authenticated and updateUser() can set a new password. That also means the
 * page is useless without a session, and says so rather than failing on
 * submit with an opaque Supabase error.
 */
export default function UpdatePasswordPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // getUser() revalidates against Supabase rather than trusting the cookie,
    // for the same reason middleware does.
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => setEmail(null))
      .finally(() => setChecking(false));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      return setError("The two passwords do not match.");
    }

    // busy must be cleared on every path including a throw, or the button
    // spins forever with nothing on screen to explain why.
    setBusy(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) return setError(error.message);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand to-brand-deep px-6 py-16">
      <div className="card w-full max-w-sm p-8">
        {/* The wordmark is the way back out to the public landing page. */}
        <Link
          href="/"
          className="mb-6 flex w-fit items-center gap-2.5 transition-opacity hover:opacity-70"
        >
          <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9" />
          <span className="text-[15px] font-semibold tracking-tight text-ink">Intake&nbsp;CRM</span>
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Set a new password</h1>

        {checking ? (
          <p className="mt-4 text-sm text-ink-muted">Checking your reset link…</p>
        ) : !email ? (
          <>
            <p className="mt-1 text-sm text-ink-muted">
              This page needs a valid reset link. The link may have expired, or already been used —
              each one works once.
            </p>
            <Link
              href="/login"
              className="mt-6 block w-full rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-brand-deep"
            >
              Request a new link
            </Link>
          </>
        ) : done ? (
          <>
            <p className="mt-1 text-sm text-ink-muted">
              Password updated for <span className="font-medium text-ink">{email}</span>. You are
              already signed in.
            </p>
            <button
              type="button"
              onClick={() => {
                router.push("/dashboard");
                router.refresh();
              }}
              className="mt-6 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-deep"
            >
              Go to dashboard
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-muted">
              For <span className="font-medium text-ink">{email}</span>
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-ink">
                  New password
                </label>
                <input
                  id="password" type="password" required minLength={6} autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand focus:bg-white"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-ink">
                  Confirm new password
                </label>
                <input
                  id="confirm" type="password" required minLength={6} autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand focus:bg-white"
                />
              </div>

              {error ? (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
              ) : null}

              <button
                type="submit" disabled={busy}
                className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
              >
                {busy ? "Working…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
