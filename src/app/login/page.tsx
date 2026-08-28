"use client";

import { useState, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleEmailPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    // Everything below is wrapped so that a thrown error surfaces in the UI.
    // Without this, an exception leaves busy=true and the button spins
    // forever with nothing to tell the user what went wrong.
    try {
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setBusy(false);

      if (error) return setError(error.message);

      // Supabase deliberately returns success for an email that already exists,
      // to avoid leaking which addresses are registered. It signals the real
      // outcome by returning an empty identities array. Without this branch the
      // UI claims a new account was created when nothing happened.
      if (data.user && data.user.identities?.length === 0) {
        return setNotice(
          "An account with this email already exists. Try signing in, or use the confirmation link already sent to you.",
        );
      }

      // If the project requires email confirmation there is no session yet.
      // Handling both settings means this works whichever way the Supabase
      // project is configured, instead of silently doing nothing.
      if (!data.session) {
        return setNotice(
          "Account created. Check your inbox for a confirmation link, then sign in. " +
            "If nothing arrives within a minute, check spam — confirmation email delivery is a known weak point.",
        );
      }
      router.push(next);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (error) {
      // Supabase returns a generic "Invalid login credentials" for an
      // unconfirmed account as well as for a wrong password, which sends
      // people hunting for a typo that isn't there.
      if (error.message.toLowerCase().includes("email not confirmed")) {
        return setError("This account has not been confirmed yet. Check your inbox for the confirmation link.");
      }
      return setError(error.message);
    }

    // No error but no session is possible, and previously fell through to a
    // redirect that middleware immediately bounced back — which looked exactly
    // like the button doing nothing at all.
    if (!data.session) {
      return setError(
        "Signed in without an active session. The account most likely still needs email confirmation.",
      );
    }

    router.push(next);
    router.refresh();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setBusy(false);
        setError(error.message);
      }
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand to-brand-deep px-6 py-16">
      <div className="card w-full max-w-sm p-8">
      <div className="mb-6 flex items-center gap-2.5">
        <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9" />
        <span className="text-[15px] font-semibold tracking-tight text-ink">Intake&nbsp;CRM</span>
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        {mode === "signin" ? "Sign in" : "Create an account"}
      </h1>
      <p className="mt-1 text-sm text-ink-muted">Email intake and triage</p>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
          <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
        </svg>
        Continue with Google
      </button>

      <div className="my-6 flex items-center gap-3">
        <hr className="flex-1 border-slate-100" />
        <span className="text-xs text-ink-muted">or</span>
        <hr className="flex-1 border-slate-100" />
      </div>

      <form onSubmit={handleEmailPassword} className="space-y-3">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink">Email</label>
          <input
            id="email" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand focus:bg-white"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink">Password</label>
          <input
            id="password" type="password" required minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand focus:bg-white"
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
        ) : null}

        <button
          type="submit" disabled={busy}
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setNotice(null); }}
          className="font-medium text-brand hover:underline"
        >
          {mode === "signin" ? "Create one" : "Sign in"}
        </button>
      </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary to avoid opting the whole
  // route out of prerendering.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
