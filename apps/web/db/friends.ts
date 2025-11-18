import { and, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { findDirectConversation } from "./conversations";
import { db } from "./index";
import {
	friendRequestStatusEnum,
	friendRequests,
	friendships,
	users,
} from "./schema";

const SCHEMA_IGNORE_CODES = new Set([
	"42710", // duplicate_object
	"42P07", // duplicate_table
	"42701", // duplicate_column
	"42P04", // duplicate_database
	"42P06", // duplicate_schema
	"42712", // duplicate_alias
	"23505", // unique_violation
]);

let friendSchemaReady: Promise<void> | null = null;

async function ensureFriendSchema() {
	if (!friendSchemaReady) {
		friendSchemaReady = (async () => {
			const statements = [
				sql`DO $$ BEGIN
          CREATE TYPE "friend_request_status" AS ENUM ('pending', 'accepted', 'declined', 'cancelled');
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$`,
				sql`
          CREATE TABLE IF NOT EXISTS "friend_requests" (
            "id" text PRIMARY KEY,
            "sender_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
            "recipient_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
            "status" "friend_request_status" NOT NULL DEFAULT 'pending',
            "created_at" timestamp with time zone NOT NULL DEFAULT now(),
            "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
            "responded_at" timestamp with time zone,
            CONSTRAINT "friend_requests_sender_recipient_check" CHECK ("sender_id" <> "recipient_id")
          )
        `,
				sql`
          CREATE TABLE IF NOT EXISTS "friendships" (
            "id" text PRIMARY KEY,
            "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
            "friend_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
            "created_at" timestamp with time zone NOT NULL DEFAULT now(),
            CONSTRAINT "friendships_user_friend_check" CHECK ("user_id" <> "friend_id")
          )
        `,
				sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "friend_requests_pending_unique"
          ON "friend_requests" (
            LEAST("sender_id", "recipient_id"),
            GREATEST("sender_id", "recipient_id")
          )
          WHERE "status" = 'pending'
        `,
				sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "friendships_unique_pair"
          ON "friendships" (
            LEAST("user_id", "friend_id"),
            GREATEST("user_id", "friend_id"),
            ("user_id" < "friend_id")
          )
        `,
			];

			for (const statement of statements) {
				try {
					await db.execute(statement);
				} catch (error) {
					const code =
						typeof error === "object" && error && "code" in error
							? (error as { code?: string }).code
							: undefined;
					if (code && SCHEMA_IGNORE_CODES.has(code)) {
						continue;
					}
					throw error;
				}
			}
		})().catch((error) => {
			friendSchemaReady = null;
			throw error;
		});
	}

	return friendSchemaReady;
}

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

export async function searchUsers(
	query: string,
	options: SearchUsersOptions = {},
) {
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
	await ensureFriendSchema();

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
	await ensureFriendSchema();

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
	await ensureFriendSchema();

	const [friends, pending] = await Promise.all([
		listFriends(userId),
		listPendingRequests(userId),
	]);

	const friendsWithConversations = await Promise.all(
		friends.map(async (friend) => ({
			...friend,
			hasConversation: Boolean(
				await findDirectConversation(userId, friend.friendId),
			),
		})),
	);

	return {
		friends: friendsWithConversations,
		incoming: pending.incoming,
		outgoing: pending.outgoing,
	};
}

export async function createFriendRequest(
	senderId: string,
	recipientId: string,
) {
	await ensureFriendSchema();

	if (senderId === recipientId) {
		throw new Error("Cannot send a friend request to yourself.");
	}

	return db.transaction(async (tx) => {
		const [existingFriendship] = await tx
			.select({ id: friendships.id })
			.from(friendships)
			.where(
				or(
					and(
						eq(friendships.userId, senderId),
						eq(friendships.friendId, recipientId),
					),
					and(
						eq(friendships.userId, recipientId),
						eq(friendships.friendId, senderId),
					),
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

export async function acceptFriendRequest(
	requestId: string,
	recipientId: string,
) {
	await ensureFriendSchema();

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

export async function declineFriendRequest(
	requestId: string,
	recipientId: string,
) {
	await ensureFriendSchema();

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
	await ensureFriendSchema();

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
	await ensureFriendSchema();

	const ids = [userId, friendId];

	const result = await db
		.delete(friendships)
		.where(
			and(inArray(friendships.userId, ids), inArray(friendships.friendId, ids)),
		)
		.returning({ id: friendships.id });

	if (result.length === 0) {
		throw new Error("Friendship not found.");
	}

	return result;
}
