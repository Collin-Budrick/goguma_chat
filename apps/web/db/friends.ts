import "server-only";

import {
  and,
  desc,
  eq,
  ilike,
  notInArray,
  or,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  type FriendRequestStatus,
  friendRequests,
  friendships,
  users,
} from "@/db/schema";

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_RESULT_LIMIT = 10;

export class FriendOperationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FriendOperationError";
    this.status = status;
  }
}

export type UserSummary = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  image: string | null;
};

export type FriendSummary = UserSummary & {
  since: Date;
};

export type FriendRequestWithUsers = {
  id: string;
  status: FriendRequestStatus;
  requesterId: string;
  recipientId: string;
  createdAt: Date;
  updatedAt: Date;
  requester: UserSummary;
  recipient: UserSummary;
};

export type FriendSnapshot = {
  friends: FriendSummary[];
  incoming: FriendRequestWithUsers[];
  outgoing: FriendRequestWithUsers[];
};

type FriendRequestRecord = {
  id: string;
  requesterId: string;
  recipientId: string;
  status: FriendRequestStatus;
};

function escapeForILike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function fetchFriendRequest(requestId: string) {
  const [request] = await db
    .select({
      id: friendRequests.id,
      requesterId: friendRequests.requesterId,
      recipientId: friendRequests.recipientId,
      status: friendRequests.status,
    })
    .from(friendRequests)
    .where(eq(friendRequests.id, requestId))
    .limit(1);

  return request ?? null;
}

async function assertPendingRequest(
  requestId: string,
): Promise<FriendRequestRecord> {
  const request = await fetchFriendRequest(requestId);

  if (!request) {
    throw new FriendOperationError("Friend request not found", 404);
  }

  if (request.status !== "pending") {
    throw new FriendOperationError("Friend request is no longer pending", 409);
  }

  return request;
}

export async function getFriends(userId: string): Promise<FriendSummary[]> {
  const rows = await db
    .select({
      friendId: friendships.friendId,
      since: friendships.createdAt,
      user: {
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        image: users.image,
      },
    })
    .from(friendships)
    .innerJoin(users, eq(friendships.friendId, users.id))
    .where(eq(friendships.userId, userId))
    .orderBy(desc(friendships.createdAt));

  return rows.map((row) => ({
    id: row.user.id,
    email: row.user.email,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    image: row.user.image,
    since: row.since,
  }));
}

export async function listPendingFriendRequests(
  userId: string,
): Promise<FriendRequestWithUsers[]> {
  const requesterAlias = alias(users, "requester");
  const recipientAlias = alias(users, "recipient");

  return db
    .select({
      id: friendRequests.id,
      status: friendRequests.status,
      requesterId: friendRequests.requesterId,
      recipientId: friendRequests.recipientId,
      createdAt: friendRequests.createdAt,
      updatedAt: friendRequests.updatedAt,
      requester: {
        id: requesterAlias.id,
        email: requesterAlias.email,
        firstName: requesterAlias.firstName,
        lastName: requesterAlias.lastName,
        image: requesterAlias.image,
      },
      recipient: {
        id: recipientAlias.id,
        email: recipientAlias.email,
        firstName: recipientAlias.firstName,
        lastName: recipientAlias.lastName,
        image: recipientAlias.image,
      },
    })
    .from(friendRequests)
    .innerJoin(requesterAlias, eq(friendRequests.requesterId, requesterAlias.id))
    .innerJoin(recipientAlias, eq(friendRequests.recipientId, recipientAlias.id))
    .where(
      and(
        eq(friendRequests.status, "pending"),
        or(
          eq(friendRequests.requesterId, userId),
          eq(friendRequests.recipientId, userId),
        ),
      ),
    )
    .orderBy(desc(friendRequests.createdAt));
}

export async function getFriendSnapshot(
  userId: string,
): Promise<FriendSnapshot> {
  const [friends, requests] = await Promise.all([
    getFriends(userId),
    listPendingFriendRequests(userId),
  ]);

  const incoming = requests.filter(
    (request) => request.recipientId === userId,
  );
  const outgoing = requests.filter(
    (request) => request.requesterId === userId,
  );

  return {
    friends,
    incoming,
    outgoing,
  };
}

export async function searchPotentialFriends(
  userId: string,
  query: string,
  limit = SEARCH_RESULT_LIMIT,
): Promise<UserSummary[]> {
  const normalized = query.trim();
  if (normalized.length < SEARCH_MIN_LENGTH) {
    return [];
  }

  const sanitizedQuery = escapeForILike(normalized);
  const pattern = `%${sanitizedQuery}%`;

  const [existingFriends, pendingRequests] = await Promise.all([
    db
      .select({ friendId: friendships.friendId })
      .from(friendships)
      .where(eq(friendships.userId, userId)),
    db
      .select({
        requesterId: friendRequests.requesterId,
        recipientId: friendRequests.recipientId,
      })
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.status, "pending"),
          or(
            eq(friendRequests.requesterId, userId),
            eq(friendRequests.recipientId, userId),
          ),
        ),
      ),
  ]);

  const excludedIds = new Set<string>([userId]);
  for (const friend of existingFriends) {
    excludedIds.add(friend.friendId);
  }
  for (const pending of pendingRequests) {
    if (pending.requesterId !== userId) {
      excludedIds.add(pending.requesterId);
    }
    if (pending.recipientId !== userId) {
      excludedIds.add(pending.recipientId);
    }
  }

  const filters = [
    or(
      ilike(users.firstName, pattern),
      ilike(users.lastName, pattern),
      ilike(users.email, pattern),
    ),
    notInArray(users.id, Array.from(excludedIds)),
  ];

  const cappedLimit = Math.max(1, Math.min(limit, SEARCH_RESULT_LIMIT));

  return db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      image: users.image,
    })
    .from(users)
    .where(and(...filters))
    .limit(cappedLimit);
}

export async function createFriendRequest(
  requesterId: string,
  recipientId: string,
) {
  if (requesterId === recipientId) {
    throw new FriendOperationError("You cannot send a friend request to yourself", 400);
  }

  const [recipient] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, recipientId))
    .limit(1);

  if (!recipient) {
    throw new FriendOperationError("Recipient not found", 404);
  }

  const [existingFriendship] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        eq(friendships.userId, requesterId),
        eq(friendships.friendId, recipientId),
      ),
    )
    .limit(1);

  if (existingFriendship) {
    throw new FriendOperationError("You are already friends", 409);
  }

  const [existingRequest] = await db
    .select({ id: friendRequests.id })
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.status, "pending"),
        or(
          and(
            eq(friendRequests.requesterId, requesterId),
            eq(friendRequests.recipientId, recipientId),
          ),
          and(
            eq(friendRequests.requesterId, recipientId),
            eq(friendRequests.recipientId, requesterId),
          ),
        ),
      ),
    )
    .limit(1);

  if (existingRequest) {
    throw new FriendOperationError("A friend request is already pending", 409);
  }

  const now = new Date();

  await db.insert(friendRequests).values({
    requesterId,
    recipientId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
}

export async function acceptFriendRequest(
  requestId: string,
  actingUserId: string,
) {
  const request = await assertPendingRequest(requestId);

  if (request.recipientId !== actingUserId) {
    throw new FriendOperationError("You cannot accept this request", 403);
  }

  await db.transaction(async (tx) => {
    const now = new Date();

    await tx
      .update(friendRequests)
      .set({ status: "accepted", updatedAt: now })
      .where(eq(friendRequests.id, requestId));

    await tx
      .insert(friendships)
      .values([
        {
          userId: request.requesterId,
          friendId: request.recipientId,
          createdAt: now,
        },
        {
          userId: request.recipientId,
          friendId: request.requesterId,
          createdAt: now,
        },
      ])
      .onConflictDoNothing({
        target: [friendships.userId, friendships.friendId],
      });
  });
}

export async function declineFriendRequest(
  requestId: string,
  actingUserId: string,
) {
  const request = await assertPendingRequest(requestId);

  if (request.recipientId !== actingUserId) {
    throw new FriendOperationError("You cannot decline this request", 403);
  }

  const now = new Date();

  await db
    .update(friendRequests)
    .set({ status: "declined", updatedAt: now })
    .where(eq(friendRequests.id, requestId));
}

export async function cancelFriendRequest(
  requestId: string,
  actingUserId: string,
) {
  const request = await assertPendingRequest(requestId);

  if (request.requesterId !== actingUserId) {
    throw new FriendOperationError("You cannot cancel this request", 403);
  }

  const now = new Date();

  await db
    .update(friendRequests)
    .set({ status: "cancelled", updatedAt: now })
    .where(eq(friendRequests.id, requestId));
}
