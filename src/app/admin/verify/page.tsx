import { EmailTokenForm } from "@/components/AdminForms";
export default function VerifyPage() {
  return (
    <section className="admin-panel admin-narrow">
      <h1>Verify your recovery email</h1>
      <p>Confirm this email address to enable admin password recovery.</p>
      <EmailTokenForm purpose="verify" />
    </section>
  );
}
