import { NextResponse } from "next/server";

import { ensureConversationParticipant } from "@/db/conversations";
import { auth } from "@/lib/auth";
import {
  subscribeToConversationEvents,
  type ConversationEvent,
} from "@/lib/server-events";

const encoder = new TextEncoder();
const HEARTBEAT_INTERVAL = 25_000;

function formatEvent(event: ConversationEvent) {
  if (event.type === "message") {
    return `event: message\ndata: ${JSON.stringify({
      message: event.message,
      clientMessageId: event.clientMessageId ?? null,
    })}\n\n`;
  }

  if (event.type === "typing") {
    return `event: typing\ndata: ${JSON.stringify(event.typing)}\n\n`;
  }

  return "";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;

  try {
    await ensureConversationParticipant(conversationId, session.user.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Forbidden";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const keepAlive = setInterval(() => {
    writer.write(encoder.encode("event: ping\ndata: {}\n\n")).catch(() => {
      clearInterval(keepAlive);
    });
  }, HEARTBEAT_INTERVAL);

  const unsubscribe = subscribeToConversationEvents(conversationId, (event) => {
    const payload = formatEvent(event);
    if (!payload) return;
    writer.write(encoder.encode(payload)).catch(() => {
      unsubscribe();
      clearInterval(keepAlive);
    });
  });

  request.signal.addEventListener("abort", () => {
    unsubscribe();
    clearInterval(keepAlive);
    writer.close().catch(() => {});
  });

  writer.write(encoder.encode("event: ready\ndata: {}\n\n")).catch(() => {
    unsubscribe();
    clearInterval(keepAlive);
  });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
