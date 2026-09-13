import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "Members | Edge Games",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";
export default function MembersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-page">
      <header className="collection-header">
        <Link href="/" className="collection-brand">
          <span aria-hidden="true">
            E<span className="brand-dot">.</span>
          </span>{" "}
          Edge Games
        </Link>
        <Link href="/members">Members</Link>
      </header>
      <main className="admin-main">{children}</main>
      <footer className="collection-footer">
        <Link href="/">Public games</Link>
        <Link href="/members/login">Member sign in</Link>
      </footer>
    </div>
  );
}
