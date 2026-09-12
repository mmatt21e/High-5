"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function AdminForm({
  action,
  children,
  submitLabel = "Save changes",
  values = {},
}: {
  action: string;
  children?: ReactNode;
  submitLabel?: string;
  values?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if ("confirmPassword" in data && data.password !== data.confirmPassword) {
      setError(true);
      setMessage("Passwords do not match.");
      return;
    }
    if (
      action === "deleteGame" &&
      !window.confirm(
        "Remove this listing? This does not delete the game or player data.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          ...data,
          ...(data.sortOrder !== undefined
            ? { sortOrder: Number(data.sortOrder) }
            : {}),
          action,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Request failed. Try again.");
      if (result.redirect) {
        router.replace(result.redirect);
        router.refresh();
      } else {
        setMessage(result.message);
        if (result.refresh) {
          if (action === "saveGame" && !values.id) form.reset();
          router.refresh();
        }
      }
    } catch (e) {
      setError(true);
      setMessage(
        e instanceof Error ? e.message : "Connection failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="admin-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        {children}
        <button className="btn-primary" type="submit">
          {busy ? "Please wait…" : submitLabel}
        </button>
      </fieldset>
      {message && (
        <p
          role={error ? "alert" : "status"}
          className={error ? "admin-error" : "admin-message"}
        >
          {message}
        </p>
      )}
    </form>
  );
}
export function Field({
  label,
  name,
  value,
  type = "text",
  required = true,
  maxLength,
  minLength,
  autoComplete,
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  autoComplete?: string;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        maxLength={maxLength}
        minLength={minLength}
        autoComplete={autoComplete}
      />
    </label>
  );
}
export function CredentialsForm({
  setup = false,
  username = "",
  email = "",
}: {
  setup?: boolean;
  username?: string;
  email?: string;
}) {
  return (
    <AdminForm
      action="credentials"
      submitLabel={
        setup ? "Save account and sign in again" : "Update account and sign out"
      }
    >
      <Field
        label={setup ? "New username (not admin)" : "Username"}
        name="username"
        value={username}
        minLength={3}
        maxLength={40}
        autoComplete="username"
      />
      <Field
        label={setup ? "Current password (admin)" : "Current password"}
        name="currentPassword"
        type="password"
        autoComplete="current-password"
      />
      <Field
        label="New password (12 characters minimum, 72 bytes maximum)"
        name="password"
        type="password"
        minLength={12}
        maxLength={72}
        autoComplete="new-password"
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        minLength={12}
        maxLength={72}
        autoComplete="new-password"
      />
      <Field
        label="Recovery email"
        name="recoveryEmail"
        type="email"
        value={email}
        maxLength={254}
        autoComplete="email"
      />
      <p className="admin-help">
        Use letters, numbers, periods, underscores, or hyphens in your username.
        Verify your email from the dashboard after signing in. Account changes
        sign out all admin sessions.
      </p>
    </AdminForm>
  );
}
export function EmailTokenForm({ purpose }: { purpose: "verify" | "reset" }) {
  const [token, setToken] = useState("");
  useEffect(() => {
    const incoming = window.location.hash.slice(1);
    if (incoming) {
      setToken(incoming);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  if (!token)
    return (
      <p role="status">
        Open the complete link from your email. If you refreshed this page,
        reopen that link.
      </p>
    );
  return (
    <AdminForm
      action={purpose}
      values={{ token }}
      submitLabel={
        purpose === "verify" ? "Verify recovery email" : "Set new password"
      }
    >
      {purpose === "reset" && (
        <>
          <Field
            label="New password (12 characters minimum, 72 bytes maximum)"
            name="password"
            type="password"
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
          />
          <Field
            label="Confirm password"
            name="confirmPassword"
            type="password"
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
          />
        </>
      )}
    </AdminForm>
  );
}
