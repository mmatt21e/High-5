import Link from "next/link";
import { memberPage } from "@/server/memberPage";
import { MemberForm } from "@/components/MemberForm";
export default async function MembersPage() {
  const member = await memberPage();
  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="collection-kicker">YOUR PRIVATE COLLECTION</p>
          <h1>Welcome, {member.displayName}.</h1>
          <p>Games and tools, shared with members.</p>
        </div>
        <div>
          <Link className="btn-outline" href="/members/account">
            My account
          </Link>
          <MemberForm action="logout" submitLabel="Sign out" />
        </div>
      </div>
      <section className="member-grid" aria-label="Member tools">
        <article className="admin-panel member-feature">
          <p className="collection-kicker">SPORTS · COMING SOON</p>
          <h2>Sports Prediction Lab</h2>
          <p>
            A place to explore forecasts, results, and model performance. The
            member edition is being prepared.
          </p>
          <Link className="btn-outline" href="/members/sports">
            See what’s planned →
          </Link>
        </article>
        <article className="admin-panel">
          <p className="collection-kicker">MORE TO EXPLORE</p>
          <h2>Room for what’s next.</h2>
          <p>
            New private games and tools will appear here as they become
            available.
          </p>
        </article>
      </section>
    </>
  );
}
