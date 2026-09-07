import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AVATAR_DATA_PREFIX } from "@/lib/avatars";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response(null, { status: 401 });
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { image: true } });
  if (!user?.image?.startsWith(AVATAR_DATA_PREFIX)) return new Response(null, { status: 404 });
  const bytes = Buffer.from(user.image.slice(AVATAR_DATA_PREFIX.length), "base64");
  return new Response(bytes, { headers: {
    "Content-Type": "image/webp", "Content-Length": String(bytes.length),
    "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff",
  } });
}
