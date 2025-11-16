import { NextResponse } from "next/server";

import {
  createMessage,
  listConversationMessages,
  listConversationParticipantIds,
  serializeMessage,
} from "@/db/conversations";
import { auth } from "@/lib/auth";
import { emitConversationEvent, emitDockIndicatorEvent } from "@/lib/server-events";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const page = await listConversationMessages(conversationId, session.user.id, {
      beforeMessageId: cursor ?? undefined,
      limit,
    });

    return NextResponse.json({
      messages: page.messages.map((message) => serializeMessage(message)),
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load messages";

    if (message.includes("not a conversation participant")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload =
    body && typeof body === "object" && "body" in body
      ? (body as { body?: unknown; clientMessageId?: unknown })
      : null;

  if (!payload?.body || typeof payload.body !== "string") {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  }

  try {
    const message = await createMessage(
      conversationId,
      session.user.id,
      payload.body,
    );

    const serialized = serializeMessage(message);

    emitConversationEvent({
      type: "message",
      conversationId,
      message: serialized,
      clientMessageId:
        typeof payload.clientMessageId === "string"
          ? payload.clientMessageId
          : undefined,
    });

    try {
      const participantIds = await listConversationParticipantIds(conversationId);

      for (const participantId of participantIds) {
        if (participantId === session.user.id) {
          continue;
        }

        emitDockIndicatorEvent(participantId, {
          type: "refresh",
          scope: "chat",
          reason: "message",
          conversationId,
        });
      }
    } catch (eventError) {
      console.error("Failed to emit dock indicator events", eventError);
    }

    return NextResponse.json({ message: serialized });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send message";

    if (message.includes("conversation participant")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    if (message.includes("required")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
