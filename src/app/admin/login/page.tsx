import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminForm, Field } from "@/components/AdminForms";
import { ADMIN_COOKIE, getAdmin } from "@/server/admin";
export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await getAdmin((await cookies()).get(ADMIN_COOKIE)?.value);
  if (admin) redirect(admin.needsSetup ? "/admin/setup" : "/admin");
  const params = await searchParams;
  return (
    <section className="admin-panel admin-narrow">
      <p className="collection-kicker">SITE OWNER</p>
      <h1>Admin sign in</h1>
      <p>Manage your game collection and site settings.</p>
      {params.updated && (
        <p role="status">
          Account saved. Sign in with your new username and password, then
          verify your recovery email.
        </p>
      )}
      {params.reset && (
        <p role="status">
          Password reset. Sign in with your new password. Your username is
          included in the recovery email.
        </p>
      )}
      <AdminForm action="login" submitLabel="Sign in">
        <Field
          label="Username"
          name="username"
          maxLength={40}
          autoComplete="username"
        />
        <Field
          label="Password"
          name="password"
          type="password"
          maxLength={100}
          autoComplete="current-password"
        />
        <details>
          <summary>First-time setup</summary>
          <p className="admin-help">
            Start with username admin and password admin. On public hosting,
            enter the private setup key from your server configuration. You must
            replace both credentials before managing the site.
          </p>
          <Field
            label="Private setup key"
            name="setupKey"
            type="password"
            required={false}
            maxLength={256}
            autoComplete="off"
          />
        </details>
      </AdminForm>
      <Link href="/admin/forgot">Forgot your password or username?</Link>
    </section>
  );
}
