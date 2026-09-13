import Link from "next/link";
import { Field } from "@/components/AdminForms";
import { MemberForm } from "@/components/MemberForm";
export default function MemberResetPage() {
  return (
    <section className="admin-panel admin-auth">
      <h1>Reset your password</h1>
      <p>
        Contact the site owner for a private reset code. Each code works once
        and expires after one hour.
      </p>
      <MemberForm action="reset" submitLabel="Reset password">
        <Field
          label="Reset code"
          name="code"
          autoComplete="off"
          maxLength={64}
        />
        <Field
          label="Member email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
        />
        <Field
          label="New password (at least 12 characters)"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
        />
        <Field
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
        />
      </MemberForm>
      <p>
        <Link href="/members/login">Back to member sign in</Link>
      </p>
    </section>
  );
}
