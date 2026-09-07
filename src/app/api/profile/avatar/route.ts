import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AVATARS, AVATAR_MAX_UPLOAD_BYTES } from "@/lib/avatars";
import { normalizeAvatar } from "@/server/avatarUpload";
import { playerSelect, publicPlayer } from "@/server/playerIdentity";
import { limitRequest, readLimitedBody } from "@/server/requestLimits";

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = limitRequest("profile:avatar", session.user.id, { limit: 15, windowMs: 60_000 });
  if (limited) return limited;
  let image: string;
  try {
    if (request.headers.get("content-type")?.split(";")[0] === "application/json") {
      const body: unknown = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 512)));
      const preset = typeof body === "object" && body && "preset" in body ? body.preset : null;
      if (!AVATARS.some((avatar) => avatar.id === preset)) throw new Error("INVALID_PRESET");
      image = `avatar:${preset}`;
    } else {
      image = await normalizeAvatar(await readLimitedBody(request, AVATAR_MAX_UPLOAD_BYTES));
    }
  } catch {
    return NextResponse.json({ error: "Choose an avatar or a still JPEG, PNG or WebP under 2 MB and 16 megapixels." }, { status: 400 });
  }
  const user = await prisma.user.update({ where: { id: session.user.id }, data: { image }, select: playerSelect });
  return NextResponse.json({ player: publicPlayer(user) });
}
