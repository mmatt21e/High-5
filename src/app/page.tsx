import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LandingPage } from "@/components/LandingPage";

export const metadata: Metadata = {
  title: "Five-O Poker | Five Hands. Three to Win.",
  description: "Play heads-up Five-O Poker. Find an opponent in the lobby, build five hands, and win three at showdown.",
  alternates: { canonical: "https://edgegames.win/" },
  openGraph: { type: "website", url: "https://edgegames.win/", siteName: "Five-O Poker", title: "Five-O Poker | Five Hands. Three to Win." },
  twitter: { card: "summary", title: "Five-O Poker | Five Hands. Three to Win." },
  robots: { index: true, follow: true },
};

export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) redirect("/lobby");
  return <LandingPage />;
}
