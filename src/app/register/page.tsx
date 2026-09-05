"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeCallbackPath } from "@/lib/safeCallbackPath";

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthPageFallback label="Loading registration…" />}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackPath(searchParams.get("callbackUrl"));
  const loginHref =
    callbackUrl === "/"
      ? "/login"
      : `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not create account");
      setLoading(false);
      return;
    }
    // Auto sign-in after registering.
    const signin = await signIn("credentials", {
      email,
      password,
      callbackUrl,
      redirect: false,
    });
    setLoading(false);
    if (signin?.error) {
      router.push(loginHref);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-black text-gold">Create account</h1>
        <p className="mt-1 text-sm text-white/70">Join Five-O Poker</p>
      </header>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3"
        aria-describedby={error ? "register-error" : undefined}
      >
        <label htmlFor="register-name" className="text-sm font-semibold text-white/80">
          Display name
        </label>
        <input
          id="register-name"
          type="text"
          autoComplete="nickname"
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          aria-invalid={Boolean(error)}
          required
          minLength={2}
          maxLength={20}
          className="field"
        />
        <label htmlFor="register-email" className="text-sm font-semibold text-white/80">
          Email
        </label>
        <input
          id="register-email"
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(error)}
          required
          className="field"
        />
        <label htmlFor="register-password" className="text-sm font-semibold text-white/80">
          Password
        </label>
        <input
          id="register-password"
          type="password"
          autoComplete="new-password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(error)}
          required
          minLength={8}
          className="field"
        />
        {error && (
          <p id="register-error" role="alert" className="text-sm text-rose-400">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-white/70">
        Already have an account?{" "}
        <Link href={loginHref} className="font-semibold text-gold underline">
          Sign in
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
