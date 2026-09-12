import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "Administration | Edge Games",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";
export default function AdminLayout({
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
        <span>Administration</span>
      </header>
      <main className="admin-main">{children}</main>
      <footer className="collection-footer">
        <Link href="/">Back to games</Link>
      </footer>
    </div>
  );
}
