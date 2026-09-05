import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { GameRoom } from "@/components/GameRoom";
import { inviteCodeSchema } from "@/lib/realtime/validation";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const parsedCode = inviteCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) {
    return <InviteError message="That invite link is invalid." />;
  }
  const code = parsedCode.data;

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(`/play/${code}`);
    redirect(`/login?callbackUrl=${callbackUrl}`);
  }

  // Seat acquisition happens on the deliberate realtime join emitted after
  // this page mounts. Keeping this GET read-only prevents prefetch from
  // consuming an invite.
  return <GameRoom code={code} />;
}

function InviteError({ message }: { message: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
      <h1 className="text-2xl font-black text-gold">Unable to join game</h1>
      <p role="alert" className="text-rose-300">
        {message}
      </p>
      <Link href="/" className="btn-primary">
        Back to lobby
      </Link>
    </main>
  );
}
