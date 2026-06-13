"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
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
      redirect: false,
    });
    setLoading(false);
    if (signin?.error) {
      router.push("/login");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-black text-gold">Create account</h1>
        <p className="mt-1 text-sm text-white/70">Join Five-O Poker</p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          autoComplete="nickname"
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          minLength={2}
          maxLength={20}
          className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 outline-none focus:border-gold"
        />
        <input
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 outline-none focus:border-gold"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 outline-none focus:border-gold"
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-gold py-3 font-bold text-felt-900 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-white/70">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-gold underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
