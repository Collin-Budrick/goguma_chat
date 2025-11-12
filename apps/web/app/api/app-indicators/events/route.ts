import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  subscribeToDockIndicatorEvents,
  type DockIndicatorEvent,
} from "@/lib/server-events";

const encoder = new TextEncoder();
const HEARTBEAT_INTERVAL = 25_000;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatIndicatorEvent(event: DockIndicatorEvent) {
  return `event: indicator\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const userId = session.user.id;

  const keepAlive = setInterval(() => {
    writer.write(encoder.encode("event: ping\ndata: {}\n\n")).catch(() => {
      clearInterval(keepAlive);
    });
  }, HEARTBEAT_INTERVAL);

  const unsubscribe = subscribeToDockIndicatorEvents(userId, (event) => {
    const payload = formatIndicatorEvent(event);
    writer.write(encoder.encode(payload)).catch(() => {
      unsubscribe();
      clearInterval(keepAlive);
    });
  });

  const closeStream = () => {
    unsubscribe();
    clearInterval(keepAlive);
    writer.close().catch(() => {});
  };

  request.signal.addEventListener("abort", closeStream);

  writer.write(encoder.encode("event: ready\ndata: {}\n\n")).catch(() => {
    closeStream();
  });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
