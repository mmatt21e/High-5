"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
export function MemberForm({
  action,
  children,
  submitLabel,
  management = false,
  values = {},
}: {
  action: string;
  children?: ReactNode;
  submitLabel: string;
  management?: boolean;
  values?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [issued, setIssued] = useState<{
    code: string;
    path: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (
      data.confirmPassword !== undefined &&
      data.confirmPassword !== data.password
    ) {
      setError(true);
      setMessage("Passwords do not match.");
      return;
    }
    if (
      (action === "revokeInvite" ||
        action === "revokeSessions" ||
        (action === "updateMember" && data.active === "false")) &&
      !window.confirm(
        "Revoke this access? Affected members will need to sign in again if access is restored.",
      )
    )
      return;
    setBusy(true);
    setError(false);
    setMessage("");
    setIssued(null);
    setCopied(false);
    try {
      const response = await fetch(
        management ? "/api/admin/members" : "/api/members",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...values,
            ...data,
            ...(data.active !== undefined
              ? { active: data.active === "true" }
              : {}),
            action,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to complete the request.");
      if (result.redirect) {
        router.replace(result.redirect);
        router.refresh();
      } else {
        setMessage(result.message);
        if (result.code) setIssued(result);
        if (result.refresh) router.refresh();
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
  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(
        `${issued.path.endsWith("/reset") ? "Reset your Edge Games member password" : "Join me at Edge Games"}: ${window.location.origin}${issued.path}\nCode: ${issued.code}\nExpires: ${new Date(issued.expiresAt).toLocaleString()}`,
      );
      setCopied(true);
    } catch {
      setMessage("Copy the code and page address below manually.");
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
      {issued && (
        <div className="member-issued">
          <strong>Copy this code before leaving</strong>
          <p>
            It is shown only here. If you lose it, revoke it and generate
            another.
          </p>
          <label className="admin-field">
            Private code
            <input
              readOnly
              value={issued.code}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <p>
            Page: {issued.path}
            <br />
            Expires: {new Date(issued.expiresAt).toLocaleString()}
          </p>
          <button className="btn-outline" type="button" onClick={copy}>
            {copied ? "Copied" : "Copy invitation message"}
          </button>
        </div>
      )}
    </form>
  );
}
