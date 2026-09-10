import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { playerSelect, publicPlayer } from "@/server/playerIdentity";
import { AppNavigation } from "@/components/AppNavigation";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { AvatarSettings } from "@/components/AvatarSettings";
import { NotificationToggle } from "@/components/NotificationToggle";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata = { title: "Settings | Five-O Poker", robots: { index: false } };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/settings");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: playerSelect });
  if (!user) redirect("/login");
  return <main className="app-screen flex flex-1 flex-col">
    <header className="app-header"><h1 className="app-title text-2xl font-black">Settings</h1><p className="app-subtitle text-sm">Make the table your own.</p></header>
    <AppNavigation current="settings" />
    <div className="panel"><AvatarSettings player={publicPlayer(user)} /></div>
    <div className="panel"><AppearanceSettings /></div>
    <section className="panel"><h2 className="mb-3 font-bold">Notifications</h2><NotificationToggle /></section>
    <section className="panel flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="font-bold">Account</h2><p className="supporting-text break-words text-sm">{user.displayName}</p></div><SignOutButton /></section>
  </main>;
}
