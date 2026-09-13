import Link from "next/link";
import { Field } from "@/components/AdminForms";
import { MemberForm } from "@/components/MemberForm";
export default async function MemberLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  const params = await searchParams;
  return (
    <section className="admin-panel admin-auth">
      <p className="collection-kicker">MEMBERS ONLY</p>
      <h1>Welcome back.</h1>
      <p>Sign in to your private collection.</p>
      {params.created && (
        <p role="status" className="admin-message">
          Account created. Sign in to continue.
        </p>
      )}
      {params.updated && (
        <p role="status" className="admin-message">
          Password updated. Sign in with your new password.
        </p>
      )}
      <MemberForm action="login" submitLabel="Member sign in">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          maxLength={254}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={100}
        />
      </MemberForm>
      <p>
        <Link href="/members/join">
          Have an invitation code? Create your account
        </Link>
      </p>
      <p>
        <Link href="/members/reset">Need to reset your password?</Link>
      </p>
      <p className="admin-help">
        Membership is by invitation. Your public game account does not grant
        member access.
      </p>
    </section>
  );
}
