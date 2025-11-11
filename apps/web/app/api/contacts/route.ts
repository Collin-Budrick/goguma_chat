import { NextResponse } from "next/server";

import { getFriendSnapshot } from "@/db/friends";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getFriendSnapshot(session.user.id);

  return NextResponse.json({
    ...snapshot,
    lastSyncedAt: new Date().toISOString(),
  });
}
