import Link from "next/link";
import { SportsLabLaunch } from "@/components/SportsLabLaunch";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, getAdmin } from "@/server/admin";

export default async function SportsLabPage() {
  const admin = await getAdmin((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!admin) redirect("/admin/login");
  if (admin.needsSetup) redirect("/admin/setup");

  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="collection-kicker">ADMINISTRATOR TOOLS</p>
          <h1>Sports Lab</h1>
          <p>Your private sports research workspace.</p>
        </div>
        <Link href="/admin" className="btn-outline">
          Back to administration
        </Link>
      </div>
      {process.env.SPORTS_LAB_ORIGIN && (
        <section className="admin-panel" aria-labelledby="secure-lab-heading">
          <h2 id="secure-lab-heading">Secure remote access</h2>
          <p>Open the full Lab using your administrator session. The Lab computer must be online.</p>
          <SportsLabLaunch />
        </section>
      )}
      <section className="admin-panel" aria-labelledby="local-lab-heading">
        <h2 id="local-lab-heading">Open on the Lab computer</h2>
        <p>
          Use this link only in a browser on the computer running Sports Lab.
          The Lab must already be running.
        </p>
        <a
          href="http://127.0.0.1:8501/"
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="btn-outline"
          aria-describedby="local-lab-limit"
        >
          Open local Sports Lab (new tab)
        </a>
        <p id="local-lab-limit" className="admin-help">
          Local computer only: 127.0.0.1 refers to the device using this browser.
          This link will not reach your Lab from a phone or another computer.
          Edge Games sign-in protects this page; the local Lab is a separate
          service and does not use your Edge Games session.
        </p>
      </section>
      {!process.env.SPORTS_LAB_ORIGIN && <section className="admin-panel" aria-labelledby="remote-lab-heading">
        <h2 id="remote-lab-heading">Remote access is not configured</h2>
        <p>
          Sports Lab is not currently served through Edge Games. Access from
          other devices requires a protected connection to the Lab computer and
          administrator checks for the Lab connection.
        </p>
      </section>}
    </>
  );
}
