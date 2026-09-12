import type { Metadata } from "next";
import { LandingPage } from "@/components/LandingPage";
export const metadata: Metadata = {
  title: "Five-O Poker | Edge Games",
  description:
    "Build five hands. Win three. Play Five-O Poker with a friend or the computer.",
  alternates: { canonical: "https://edgegames.win/games/five-o" },
};
export default function FiveOPage() {
  return <LandingPage />;
}
