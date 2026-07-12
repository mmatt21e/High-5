"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";

export default function LoginPage() {
  const router = useRouter();
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
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-black text-gold">Five-O Poker</h1>
        <p className="mt-1 text-sm text-white/70">Sign in to play</p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="field"
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="field"
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {googleEnabled && (
        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="btn-ghost"
        >
          Continue with Google
        </button>
      )}

      <p className="text-center text-sm text-white/70">
        New here?{" "}
        <Link href="/register" className="font-semibold text-gold underline">
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
