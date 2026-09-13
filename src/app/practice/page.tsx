import type { Metadata } from "next";
import { GuidedPractice } from "@/components/GuidedPractice";

export const metadata: Metadata = {
  title: "Guided practice · Five-O Poker",
  description: "Learn Five-O with a short, hands-on practice game. No account needed.",
};

export default function PracticePage() {
  return <GuidedPractice />;
}
