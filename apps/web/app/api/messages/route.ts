import { NextResponse } from "next/server";

import {
  createMessage,
  listConversationParticipantIds,
  serializeMessage,
} from "@/db/conversations";
import { auth } from "@/lib/auth";
import {
  emitConversationEvent,
  emitDockIndicatorEvent,
} from "@/lib/server-events";

type SendMessagePayload = {
  conversationId?: string;
  body?: string;
  clientMessageId?: string;
};

const LEGACY_MESSAGES_DISABLED = process.env.NODE_ENV === "production";

export async function POST(request: Request) {
  if (LEGACY_MESSAGES_DISABLED) {
    throw new Error("Legacy /api/messages route is disabled in production builds.");
  }

  return handlePost(request);
}

async function handlePost(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SendMessagePayload;

  try {
    body = (await request.json()) as SendMessagePayload;
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.conversationId || typeof body.conversationId !== "string") {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  if (!body.body || typeof body.body !== "string") {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  }

  try {
    const message = await createMessage(
      body.conversationId,
      session.user.id,
      body.body,
    );

    const serialized = serializeMessage(message);

    emitConversationEvent({
      type: "message",
      conversationId: body.conversationId,
      message: serialized,
      clientMessageId:
        typeof body.clientMessageId === "string" ? body.clientMessageId : undefined,
    });

    try {
      const participantIds = await listConversationParticipantIds(body.conversationId);
      for (const participantId of participantIds) {
        if (participantId === session.user.id) {
          continue;
        }
        emitDockIndicatorEvent(participantId, {
          type: "refresh",
          scope: "chat",
          reason: "message",
          conversationId: body.conversationId,
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
