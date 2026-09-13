import Link from "next/link";
import { memberPage } from "@/server/memberPage";
export default async function SportsPage() {
  await memberPage();
  return (
    <>
      <Link href="/members">← Member collection</Link>
      <div className="admin-heading">
        <div>
          <p className="collection-kicker">COMING SOON</p>
          <h1>Sports Prediction Lab</h1>
          <p>The first tool in your private collection.</p>
        </div>
      </div>
      <section className="admin-panel">
        <h2>A closer look at the game.</h2>
        <p>
          The planned member edition will bring together published forecasts,
          past results, and model performance, starting with MLB and NFL.
        </p>
        <p>
          It is not connected yet. No live forecasts or prediction runs are
          available on this page.
        </p>
      </section>
    </>
  );
}
