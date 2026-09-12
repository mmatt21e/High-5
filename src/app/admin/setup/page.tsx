import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CredentialsForm } from "@/components/AdminForms";
import { ADMIN_COOKIE, getAdmin } from "@/server/admin";
export default async function SetupPage() {
  const admin = await getAdmin((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!admin) redirect("/admin/login");
  if (!admin.needsSetup) redirect("/admin");
  return (
    <section className="admin-panel admin-narrow">
      <p className="collection-kicker">FIRST LOGIN</p>
      <h1>Make this account yours.</h1>
      <p>
        Replace the default username and password, and choose your recovery
        email. This step is required before you can use administration.
      </p>
      <CredentialsForm setup />
    </section>
  );
}
