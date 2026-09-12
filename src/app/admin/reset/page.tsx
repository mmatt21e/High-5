import { EmailTokenForm } from "@/components/AdminForms";
export default function ResetPage() {
  return (
    <section className="admin-panel admin-narrow">
      <h1>Choose a new password</h1>
      <p>This link expires after 30 minutes and can be used once.</p>
      <EmailTokenForm purpose="reset" />
    </section>
  );
}
