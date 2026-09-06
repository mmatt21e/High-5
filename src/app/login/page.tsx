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
    <main className="app-screen flex flex-1 flex-col justify-center">
      <header className="app-header text-center">
        <h1 className="app-title text-3xl font-black">Five-O Poker</h1>
        <p className="app-subtitle mt-1 text-sm">Sign in to play</p>
      </header>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3"
        aria-describedby={error ? "login-error" : undefined}
      >
        <label htmlFor="login-email" className="form-label text-sm font-semibold">
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
        <label htmlFor="login-password" className="form-label text-sm font-semibold">
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
          <p id="login-error" role="alert" className="error-text text-sm">
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

      <p className="supporting-text text-center text-sm">
        New here?{" "}
        <Link href={registerHref} className="nav-link px-2 font-semibold text-gold">
          Create an account
        </Link>
      </p>
      <p className="text-center text-sm">
        <Link href="/how-to-play" className="nav-link px-2">
          How to play &amp; customize cards
        </Link>
      </p>
    </main>
  );
}

function AuthPageFallback({ label }: { label: string }) {
  return (
    <main className="app-screen supporting-text flex flex-1 items-center justify-center">
      {label}
    </main>
  );
}
