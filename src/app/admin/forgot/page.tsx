import Link from "next/link";
import { AdminForm, Field } from "@/components/AdminForms";
export default function ForgotPage() {
  return (
    <section className="admin-panel admin-narrow">
      <h1>Recover your account</h1>
      <p>
        Enter the recovery email you verified in administration. We’ll send a
        password reset link and your username.
      </p>
      <AdminForm action="forgot" submitLabel="Send recovery link">
        <Field
          label="Recovery email"
          name="email"
          type="email"
          maxLength={254}
          autoComplete="email"
        />
      </AdminForm>
      <Link href="/admin/login">Back to sign in</Link>
    </section>
  );
}
