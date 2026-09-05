"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeCallbackPath } from "@/lib/safeCallbackPath";

const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageFallback label="Loading sign in…" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackPath(searchParams.get("callbackUrl"));
  const registerHref =
    callbackUrl === "/"
      ? "/register"
      : `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      callbackUrl,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-black text-gold">Five-O Poker</h1>
        <p className="mt-1 text-sm text-white/70">Sign in to play</p>
      </header>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3"
        aria-describedby={error ? "login-error" : undefined}
      >
        <label htmlFor="login-email" className="text-sm font-semibold text-white/80">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(error)}
          required
          className="field"
        />
        <label htmlFor="login-password" className="text-sm font-semibold text-white/80">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(error)}
          required
          className="field"
        />
        {error && (
          <p id="login-error" role="alert" className="text-sm text-rose-400">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {googleEnabled && (
        <button
          onClick={() => signIn("google", { callbackUrl })}
          className="btn-ghost"
        >
          Continue with Google
        </button>
      )}

      <p className="text-center text-sm text-white/70">
        New here?{" "}
        <Link href={registerHref} className="font-semibold text-gold underline">
          Create an account
        </Link>
      </p>
      <p className="text-center text-sm">
        <Link href="/how-to-play" className="text-white/60 underline">
          How to play Five-O
        </Link>
      </p>
    </main>
  );
}

function AuthPageFallback({ label }: { label: string }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6 text-white/70">
      {label}
    </main>
  );
}
