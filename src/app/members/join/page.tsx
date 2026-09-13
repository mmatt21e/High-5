import Link from "next/link";
import { Field } from "@/components/AdminForms";
import { MemberForm } from "@/components/MemberForm";
export default function MemberJoinPage() {
  return (
    <section className="admin-panel admin-auth">
      <p className="collection-kicker">YOU’RE INVITED</p>
      <h1>Your seat is waiting.</h1>
      <p>
        Use the private code shared by the site owner to create your member
        account.
      </p>
      <MemberForm action="join" submitLabel="Create member account">
        <Field
          label="Invitation code"
          name="code"
          autoComplete="off"
          maxLength={64}
        />
        <Field
          label="Your name"
          name="displayName"
          autoComplete="name"
          maxLength={80}
        />
        <Field
          label="Email (use the address invited)"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
        />
        <Field
          label="Password (at least 12 characters)"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
        />
        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
        />
      </MemberForm>
      <p>
        <Link href="/members/login">Already a member? Sign in</Link>
      </p>
    </section>
  );
}
