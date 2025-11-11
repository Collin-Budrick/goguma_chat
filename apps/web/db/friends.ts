import { and, eq, ilike, inArray, notInArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "./index";
import {
  friendRequestStatusEnum,
  friendRequests,
  friendships,
  users,
} from "./schema";

export type FriendRequestStatus =
  (typeof friendRequestStatusEnum.enumValues)[number];

const FRIEND_REQUEST_PENDING = "pending" as FriendRequestStatus;
const FRIEND_REQUEST_ACCEPTED = "accepted" as FriendRequestStatus;
const FRIEND_REQUEST_DECLINED = "declined" as FriendRequestStatus;
const FRIEND_REQUEST_CANCELLED = "cancelled" as FriendRequestStatus;

type SearchUsersOptions = {
  limit?: number;
  excludeUserIds?: string[];
};

export async function searchUsers(query: string, options: SearchUsersOptions = {}) {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const { limit = 10, excludeUserIds = [] } = options;
  const pattern = `%${trimmed}%`;

  let where = or(
    ilike(users.email, pattern),
    ilike(users.firstName, pattern),
    ilike(users.lastName, pattern),
  );

  if (excludeUserIds.length > 0) {
    where = and(where, notInArray(users.id, excludeUserIds));
  }

  return db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      image: users.image,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .limit(limit);
}

export async function listFriends(userId: string) {
  return db
    .select({
      friendshipId: friendships.id,
      friendId: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      image: users.image,
      createdAt: friendships.createdAt,
    })
    .from(friendships)
    .innerJoin(users, eq(friendships.friendId, users.id))
    .where(eq(friendships.userId, userId))
    .orderBy(friendships.createdAt);
}

export async function listPendingRequests(userId: string) {
  const sender = alias(users, "sender");
  const recipient = alias(users, "recipient");

  const results = await db
    .select({
      id: friendRequests.id,
      status: friendRequests.status,
      senderId: friendRequests.senderId,
      recipientId: friendRequests.recipientId,
      createdAt: friendRequests.createdAt,
      updatedAt: friendRequests.updatedAt,
      respondedAt: friendRequests.respondedAt,
      sender: {
        id: sender.id,
        email: sender.email,
        firstName: sender.firstName,
        lastName: sender.lastName,
        image: sender.image,
      },
      recipient: {
        id: recipient.id,
        email: recipient.email,
        firstName: recipient.firstName,
        lastName: recipient.lastName,
        image: recipient.image,
      },
    })
    .from(friendRequests)
    .innerJoin(sender, eq(sender.id, friendRequests.senderId))
    .innerJoin(recipient, eq(recipient.id, friendRequests.recipientId))
    .where(
      and(
        eq(friendRequests.status, FRIEND_REQUEST_PENDING),
        or(
          eq(friendRequests.senderId, userId),
          eq(friendRequests.recipientId, userId),
        ),
      ),
    )
    .orderBy(friendRequests.createdAt);

  return {
    incoming: results.filter((request) => request.recipientId === userId),
    outgoing: results.filter((request) => request.senderId === userId),
  };
}

export async function getFriendState(userId: string) {
  const [friends, pending] = await Promise.all([
    listFriends(userId),
    listPendingRequests(userId),
  ]);

  return {
    friends,
    incoming: pending.incoming,
    outgoing: pending.outgoing,
  };
}

export async function createFriendRequest(
  senderId: string,
  recipientId: string,
) {
  if (senderId === recipientId) {
    throw new Error("Cannot send a friend request to yourself.");
  }

  return db.transaction(async (tx) => {
    const [existingFriendship] = await tx
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        or(
          and(eq(friendships.userId, senderId), eq(friendships.friendId, recipientId)),
          and(eq(friendships.userId, recipientId), eq(friendships.friendId, senderId)),
        ),
      )
      .limit(1);

    if (existingFriendship) {
      throw new Error("Users are already friends.");
    }

    const [existingRequest] = await tx
      .select({ id: friendRequests.id, status: friendRequests.status })
      .from(friendRequests)
      .where(
        and(
          or(
            and(
              eq(friendRequests.senderId, senderId),
              eq(friendRequests.recipientId, recipientId),
            ),
            and(
              eq(friendRequests.senderId, recipientId),
              eq(friendRequests.recipientId, senderId),
            ),
          ),
          eq(friendRequests.status, FRIEND_REQUEST_PENDING),
        ),
      )
      .limit(1);

    if (existingRequest) {
      return existingRequest;
    }

    const [request] = await tx
      .insert(friendRequests)
      .values({
        senderId,
        recipientId,
        status: FRIEND_REQUEST_PENDING,
      })
      .returning();

    return request;
  });
}

export async function acceptFriendRequest(requestId: string, recipientId: string) {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select({
        id: friendRequests.id,
        senderId: friendRequests.senderId,
        recipientId: friendRequests.recipientId,
        status: friendRequests.status,
      })
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.id, requestId),
          eq(friendRequests.recipientId, recipientId),
        ),
      )
      .limit(1);

    if (!request || request.status !== FRIEND_REQUEST_PENDING) {
      throw new Error("Friend request is not pending or does not exist.");
    }

    const timestamp = new Date();

    await tx
      .update(friendRequests)
      .set({
        status: FRIEND_REQUEST_ACCEPTED,
        respondedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(friendRequests.id, requestId));

    await tx.insert(friendships).values([
      {
        userId: request.senderId,
        friendId: request.recipientId,
      },
      {
        userId: request.recipientId,
        friendId: request.senderId,
      },
    ]);

    return {
      ...request,
      status: FRIEND_REQUEST_ACCEPTED,
      respondedAt: timestamp,
    };
  });
}

export async function declineFriendRequest(requestId: string, recipientId: string) {
  const timestamp = new Date();

  const result = await db
    .update(friendRequests)
    .set({
      status: FRIEND_REQUEST_DECLINED,
      respondedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(friendRequests.id, requestId),
        eq(friendRequests.recipientId, recipientId),
        eq(friendRequests.status, FRIEND_REQUEST_PENDING),
      ),
    )
    .returning();

  if (!result.length) {
    throw new Error("Unable to decline friend request.");
  }

  return result[0];
}

export async function cancelFriendRequest(requestId: string, senderId: string) {
  const timestamp = new Date();

  const result = await db
    .update(friendRequests)
    .set({
      status: FRIEND_REQUEST_CANCELLED,
      respondedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(friendRequests.id, requestId),
        eq(friendRequests.senderId, senderId),
        eq(friendRequests.status, FRIEND_REQUEST_PENDING),
      ),
    )
    .returning();

  if (!result.length) {
    throw new Error("Unable to cancel friend request.");
  }

  return result[0];
}

export async function removeFriendship(userId: string, friendId: string) {
  const ids = [userId, friendId];

  const result = await db
    .delete(friendships)
    .where(
      and(
        inArray(friendships.userId, ids),
        inArray(friendships.friendId, ids),
      ),
    )
    .returning({ id: friendships.id });

  if (result.length === 0) {
    throw new Error("Friendship not found.");
  }

  return result;
}
