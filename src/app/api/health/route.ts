import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const responseHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET() {
  try {
    // Touch the auth and game tables, including columns introduced after the
    // baseline, so readiness covers the schema the running build actually uses.
    await prisma.$transaction([
      prisma.user.findFirst({ select: { id: true } }),
      prisma.match.findFirst({ select: { id: true, gameSeed: true } }),
      prisma.game.findFirst({ select: { id: true, seed: true } }),
    ]);

    return NextResponse.json(
      { status: "ok" },
      { status: 200, headers: responseHeaders },
    );
  } catch (error) {
    console.error("Health check failed", error);

    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: responseHeaders },
    );
  }
}
