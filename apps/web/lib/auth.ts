import {
	randomBytes,
	randomUUID,
	timingSafeEqual,
	scrypt as nodeScrypt,
} from "node:crypto";
import { eq } from "drizzle-orm";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import type { Session } from "next-auth";
import type { NextRequest } from "next/server";
import Credentials from "next-auth/providers/credentials";
import { promisify } from "node:util";

import { db } from "@/db";
import { authAdapterTables, users } from "@/db/schema";

type AdapterSchema = Extract<
	NonNullable<Parameters<typeof DrizzleAdapter>[1]>,
	{ usersTable: typeof users }
>;

function toNullable(value?: string | null) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}
const scrypt = promisify(nodeScrypt);

const SALT_SIZE = 16;
const KEY_LENGTH = 64;
const NEXTAUTH_SECRET =
	process.env.NEXTAUTH_SECRET ?? "goguma-development-secret";

async function hashPassword(value: string) {
	const salt = randomBytes(SALT_SIZE).toString("hex");
	const derivedKey = (await scrypt(value, salt, KEY_LENGTH)) as Buffer;
	return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(value: string, hashed: string) {
	const [salt, storedKey] = hashed.split(":");
	if (!salt || !storedKey) {
		return false;
	}
	const derivedKey = (await scrypt(value, salt, KEY_LENGTH)) as Buffer;
	const storedBuffer = Buffer.from(storedKey, "hex");
	if (storedBuffer.length !== derivedKey.length) {
		return false;
	}
	return timingSafeEqual(storedBuffer, derivedKey);
}

type CredentialsUser = {
	id: string;
	email?: string | null;
	name?: string | null;
	firstName?: string | null;
	lastName?: string | null;
};

type MutableToken = {
	[key: string]: unknown;
	id?: string;
	email?: string;
	name?: string;
	firstName?: string;
	lastName?: string;
};

type AuthRouteHandler = (
	request: NextRequest,
	context: { params: Promise<{ nextauth: string[] }> },
) => Promise<Response> | Response;

type CreateAuthResult = {
	handlers: {
		GET: AuthRouteHandler;
		POST: AuthRouteHandler;
	};
	auth: () => Promise<Session | null>;
	signIn: (...args: unknown[]) => Promise<unknown>;
	signOut: (...args: unknown[]) => Promise<unknown>;
};

export const authConfig = {
	adapter: DrizzleAdapter(
		db,
		authAdapterTables as AdapterSchema, // Custom auth tables don't match DefaultPostgresSchema signature
	),
	session: {
		strategy: "jwt",
	},
	pages: {
		signIn: "/login",
	},
	providers: [
		Credentials({
			id: "credentials",
			name: "Workspace login",
			credentials: {
				email: { label: "Work email", type: "email" },
				password: { label: "Password", type: "password" },
				firstName: { label: "First name", type: "text" },
				lastName: { label: "Last name", type: "text" },
				mode: { label: "Form mode", type: "text" },
			},
			async authorize(credentials) {
				const email =
					typeof credentials?.email === "string"
						? toNullable(credentials.email.toLowerCase())
						: null;
				const password =
					typeof credentials?.password === "string"
						? toNullable(credentials.password)
						: null;

				if (!email || !password) {
					return null;
				}

				const requestedFirstName =
					typeof credentials?.firstName === "string"
						? toNullable(credentials.firstName)
						: null;
				const requestedLastName =
					typeof credentials?.lastName === "string"
						? toNullable(credentials.lastName)
						: null;

				const formMode =
					typeof credentials?.mode === "string"
						? credentials.mode.toLowerCase()
						: null;
				const isSignup = formMode === "signup";

				const [existing] = await db
					.select()
					.from(users)
					.where(eq(users.email, email))
					.limit(1);

				const now = new Date();

				if (!existing) {
					if (!isSignup) {
						return null;
					}

					const passwordHash = await hashPassword(password);
					const id = randomUUID();
					const newUser = {
						id,
						email,
						emailVerified: now,
						firstName: requestedFirstName,
						lastName: requestedLastName,
						passwordHash,
						createdAt: now,
						updatedAt: now,
					};

					await db.insert(users).values(newUser);

					return {
						id,
						email,
						name:
							[requestedFirstName, requestedLastName]
								.filter(Boolean)
								.join(" ") || email,
						firstName: requestedFirstName,
						lastName: requestedLastName,
					};
				}

				if (!existing.passwordHash) {
					const passwordHash = await hashPassword(password);
					await db
						.update(users)
						.set({
							passwordHash,
							updatedAt: now,
						})
						.where(eq(users.id, existing.id));
				} else {
					const passwordMatches = await verifyPassword(
						password,
						existing.passwordHash,
					);
					if (!passwordMatches) {
						return null;
					}
				}

				const updatedFirstName = requestedFirstName ?? existing.firstName;
				const updatedLastName = requestedLastName ?? existing.lastName;
				const updatedEmail = existing.email === email ? existing.email : email;

				if (
					updatedFirstName !== existing.firstName ||
					updatedLastName !== existing.lastName ||
					updatedEmail !== existing.email
				) {
					await db
						.update(users)
						.set({
							email: updatedEmail,
							firstName: updatedFirstName,
							lastName: updatedLastName,
							updatedAt: now,
						})
						.where(eq(users.id, existing.id));
				}

				return {
					id: existing.id,
					email: updatedEmail,
					name:
						[updatedFirstName, updatedLastName].filter(Boolean).join(" ") ||
						updatedEmail,
					firstName: updatedFirstName,
					lastName: updatedLastName,
				};
			},
		}),
	],
	callbacks: {
		async jwt({
			token,
			user,
		}: {
			token: MutableToken;
			user?: CredentialsUser | null;
		}) {
			if (user) {
				token.id = user.id;
				if (user.email) {
					token.email = user.email;
				}
				if (user.name) {
					token.name = user.name;
				}
				token.firstName =
					"firstName" in user && typeof user.firstName === "string"
						? user.firstName
						: undefined;
				token.lastName =
					"lastName" in user && typeof user.lastName === "string"
						? user.lastName
						: undefined;
			}
			return token;
		},
		async session({
			session,
			token,
		}: {
			session: Session & {
				user?: {
					id?: string;
					firstName?: string;
					lastName?: string;
				};
			};
			token?: MutableToken;
		}) {
			if (session.user && token) {
				session.user.id = typeof token.id === "string" ? token.id : undefined;
				session.user.firstName =
					typeof token?.firstName === "string" ? token.firstName : undefined;
				session.user.lastName =
					typeof token?.lastName === "string" ? token.lastName : undefined;
			}
			return session;
		},
	},
	secret: NEXTAUTH_SECRET,
};

const createAuth = NextAuth as unknown as (
	config: typeof authConfig,
) => CreateAuthResult;

export const { handlers, auth, signIn, signOut } = createAuth(authConfig);
