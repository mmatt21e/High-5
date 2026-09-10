import Link from "next/link";

export function AppNavigation({ current }: { current: "lobby" | "profile" | "settings" }) {
  return <nav className="app-navigation" aria-label="Main navigation">
    {([['lobby', '/lobby', 'Lobby'], ['profile', '/profile', 'Profile & history'], ['settings', '/settings', 'Settings']] as const).map(([key, href, label]) =>
      <Link key={key} href={href} className="nav-link" aria-current={current === key ? "page" : undefined}>{label}</Link>)}
  </nav>;
}
