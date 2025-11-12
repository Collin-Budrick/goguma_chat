import { and, desc, eq, lt, or } from "drizzle-orm";

import { db } from "./index";
import {
  conversationParticipants,
  conversations,
  conversationTypeEnum,
  friendships,
  messages,
  users,
} from "./schema";

const DIRECT_CONVERSATION = "direct" satisfies
  (typeof conversationTypeEnum.enumValues)[number];

const MAX_MESSAGE_LIMIT = 100;
const DEFAULT_MESSAGE_LIMIT = 30;

export type ConversationRecord = typeof conversations.$inferSelect;
export type ConversationParticipantRecord =
  typeof conversationParticipants.$inferSelect;
export type MessageRecord = typeof messages.$inferSelect;

export type ConversationParticipant = ConversationParticipantRecord & {
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    image: string | null;
  };
};

export type ConversationWithParticipants = ConversationRecord & {
  participants: ConversationParticipant[];
};

export type MessageWithSender = MessageRecord & {
  sender: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    image: string | null;
  };
};

type MessagePageOptions = {
  limit?: number;
  beforeMessageId?: string;
};

type MessagePage = {
  messages: MessageWithSender[];
  nextCursor: string | null;
};

function makeDirectKey(userA: string, userB: string) {
  const [left, right] = [userA, userB].sort();
  return `${left}:${right}`;
}

export async function findDirectConversation(
  viewerId: string,
  friendId: string,
  client = db,
): Promise<ConversationRecord | null> {
  const directKey = makeDirectKey(viewerId, friendId);

  const [conversation] = await client
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.type, DIRECT_CONVERSATION),
        eq(conversations.directKey, directKey),
      ),
    )
    .limit(1);

  return conversation ?? null;
}

async function assertFriendship(
  userId: string,
  friendId: string,
  client = db,
) {
  const [friendship] = await client
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)))
    .limit(1);

  if (!friendship) {
    throw new Error("Users are not friends");
  }
}

async function getParticipants(
  conversationId: string,
  client = db,
): Promise<ConversationParticipant[]> {
  return client
    .select({
      conversationId: conversationParticipants.conversationId,
      userId: conversationParticipants.userId,
      joinedAt: conversationParticipants.joinedAt,
      user: {
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        image: users.image,
      },
    })
    .from(conversationParticipants)
    .innerJoin(users, eq(users.id, conversationParticipants.userId))
    .where(eq(conversationParticipants.conversationId, conversationId));
}

export async function getDirectConversation(
  viewerId: string,
  friendId: string,
): Promise<ConversationWithParticipants> {
  const directKey = makeDirectKey(viewerId, friendId);

  return db.transaction(async (tx) => {
    await assertFriendship(viewerId, friendId, tx);

    const [existing] = await tx
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.type, DIRECT_CONVERSATION),
          eq(conversations.directKey, directKey),
        ),
      )
      .limit(1);

    let conversation = existing;

    if (!conversation) {
      const [inserted] = await tx
        .insert(conversations)
        .values({ type: DIRECT_CONVERSATION, directKey })
        .onConflictDoNothing({ target: conversations.directKey })
        .returning();

      if (inserted) {
        conversation = inserted;
      } else {
        const [conflict] = await tx
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.type, DIRECT_CONVERSATION),
              eq(conversations.directKey, directKey),
            ),
          )
          .limit(1);

        if (!conflict) {
          throw new Error("Failed to load conversation");
        }

        conversation = conflict;
      }
    }

    await tx
      .insert(conversationParticipants)
      .values([
        {
          conversationId: conversation.id,
          userId: viewerId,
        },
        {
          conversationId: conversation.id,
          userId: friendId,
        },
      ])
      .onConflictDoNothing();

    const participants = await getParticipants(conversation.id, tx);

    return { ...conversation, participants };
  });
}

async function assertParticipant(
  conversationId: string,
  userId: string,
  client = db,
) {
  const [participant] = await client
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);

  if (!participant) {
    throw new Error("User is not a conversation participant");
  }
}

function normalizeMessageDates(row: MessageWithSender): MessageWithSender {
  return {
    ...row,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt
        : new Date(row.createdAt ?? new Date()),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt
        : new Date(row.updatedAt ?? new Date()),
  } as MessageWithSender;
}

export async function listConversationMessages(
  conversationId: string,
  userId: string,
  options: MessagePageOptions = {},
): Promise<MessagePage> {
  await assertParticipant(conversationId, userId);

  const rawLimit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.floor(options.limit)
      : DEFAULT_MESSAGE_LIMIT;

  const limit = Math.min(Math.max(rawLimit, 1), MAX_MESSAGE_LIMIT);

  let cursorCreatedAt: Date | null = null;
  let cursorId: string | null = null;

  if (options.beforeMessageId) {
    const [cursor] = await db
      .select({
        id: messages.id,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.id, options.beforeMessageId),
          eq(messages.conversationId, conversationId),
        ),
      )
      .limit(1);

    if (!cursor) {
      return { messages: [], nextCursor: null };
    }

    cursorCreatedAt = cursor.createdAt ?? null;
    cursorId = cursor.id;
  }

  const conditions = [eq(messages.conversationId, conversationId)];

  if (cursorCreatedAt && cursorId) {
    conditions.push(
      or(
        lt(messages.createdAt, cursorCreatedAt),
        and(
          eq(messages.createdAt, cursorCreatedAt),
          lt(messages.id, cursorId),
        ),
      ),
    );
  }

  const results = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      senderId: messages.senderId,
      body: messages.body,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
      sender: {
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        image: users.image,
      },
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const trimmed = hasMore ? results.slice(0, limit) : results;
  const sorted = trimmed.reverse();

  const nextCursor = hasMore ? sorted[0]?.id ?? null : null;

  return {
    messages: sorted.map((row) => normalizeMessageDates(row)),
    nextCursor,
  };
}

export async function getConversationWithParticipants(
  conversationId: string,
  userId: string,
): Promise<ConversationWithParticipants> {
  await assertParticipant(conversationId, userId);

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const participants = await getParticipants(conversation.id);

  return { ...conversation, participants };
}

export async function createMessage(
  conversationId: string,
  senderId: string,
  body: string,
): Promise<MessageWithSender> {
  if (!body.trim()) {
    throw new Error("Message body is required");
  }

  await assertParticipant(conversationId, senderId);

  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId,
      senderId,
      body,
    })
    .returning({
      id: messages.id,
      conversationId: messages.conversationId,
      senderId: messages.senderId,
      body: messages.body,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
    });

  if (!inserted) {
    throw new Error("Failed to create message");
  }

  await db
    .update(conversations)
    .set({ updatedAt: inserted.createdAt })
    .where(eq(conversations.id, conversationId));

  const [sender] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      image: users.image,
    })
    .from(users)
    .where(eq(users.id, senderId))
    .limit(1);

  if (!sender) {
    throw new Error("Sender not found");
  }

  return {
    ...inserted,
    sender,
  };
}

function toISOString(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export type SerializedConversation = Omit<ConversationRecord, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
  participants: (Omit<ConversationParticipant, "joinedAt"> & { joinedAt: string })[];
};

export type SerializedMessage = Omit<MessageWithSender, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export function serializeConversation(
  conversation: ConversationWithParticipants,
): SerializedConversation {
  return {
    ...conversation,
    createdAt: toISOString(conversation.createdAt),
    updatedAt: toISOString(conversation.updatedAt),
    participants: conversation.participants.map((participant) => ({
      ...participant,
      joinedAt: toISOString(participant.joinedAt),
    })),
  };
}

export function serializeMessage(message: MessageWithSender): SerializedMessage {
  return {
    ...message,
    createdAt: toISOString(message.createdAt),
    updatedAt: toISOString(message.updatedAt),
  };
}

export async function ensureConversationParticipant(
  conversationId: string,
  userId: string,
) {
  await assertParticipant(conversationId, userId);
}
