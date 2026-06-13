import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GameRoom } from "@/components/GameRoom";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { code } = await params;
  return <GameRoom code={code.toUpperCase()} />;
}
