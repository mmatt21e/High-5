import Link from "next/link";
import { memberPage } from "@/server/memberPage";
import { Field } from "@/components/AdminForms";
import { MemberForm } from "@/components/MemberForm";
export default async function MemberAccountPage() {
  const member = await memberPage();
  return (
    <>
      <Link href="/members">← Member collection</Link>
      <div className="admin-heading">
        <div>
          <h1>My account</h1>
          <p>
            {member.displayName} · {member.email}
          </p>
        </div>
      </div>
      <section className="admin-panel">
        <h2>Change password</h2>
        <p>Changing your password signs you out on every device.</p>
        <MemberForm
          action="password"
          submitLabel="Change password and sign out"
        >
          <Field
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={100}
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
      </section>
    </>
  );
}
