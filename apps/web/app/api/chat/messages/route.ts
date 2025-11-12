import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";
import type { ChatMessage, SendMessageResponse } from "@/lib/chat/types";
import {
  buildConversationId,
  createAutoReply,
  resolveProfileName,
} from "../helpers";

const bodySchema = z.object({
  friendId: z.string().min(1),
  content: z.string().min(1),
  mode: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { friendId, content } = parsed.data;
  const state = await getFriendState(session.user.id);
  const friend = state.friends.find((entry) => entry.friendId === friendId);

  if (!friend) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conversationId = buildConversationId(session.user.id, friendId);
  const sentAt = new Date();
  const viewerMessage: ChatMessage = {
    id: `${conversationId}:${randomUUID()}`,
    authorId: session.user.id,
    body: content.trim(),
    sentAt: sentAt.toISOString(),
  };

  const friendName = resolveProfileName({
    firstName: friend.firstName,
    lastName: friend.lastName,
    email: friend.email,
    fallback: friendId,
  });
  const viewerName = resolveProfileName({
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    email: session.user.email ?? null,
    fallback: "friend",
  });

  const reply: ChatMessage = {
    id: `${conversationId}:${randomUUID()}`,
    authorId: friendId,
    body: createAutoReply(viewerName, friendName, content),
    sentAt: new Date(sentAt.getTime() + 1000 * 5).toISOString(),
  };

  const payload: SendMessageResponse = {
    conversationId,
    message: viewerMessage,
    replies: [reply],
  };

  return NextResponse.json(payload);
}
