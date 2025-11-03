import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { NextAuthConfig } from "next-auth";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { db } from "@/db";
import { authSchema, users } from "@/db/schema";

function toNullable(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, authSchema),
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
        firstName: { label: "First name", type: "text" },
        lastName: { label: "Last name", type: "text" },
      },
      async authorize(credentials) {
        const email = toNullable(credentials?.email?.toLowerCase());

        if (!email) {
          return null;
        }

        const requestedFirstName = toNullable(credentials?.firstName);
        const requestedLastName = toNullable(credentials?.lastName);

        const [existing] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        const now = new Date();

        if (!existing) {
          const id = randomUUID();
          const newUser = {
            id,
            email,
            emailVerified: now,
            firstName: requestedFirstName,
            lastName: requestedLastName,
            createdAt: now,
            updatedAt: now,
          };

          await db.insert(users).values(newUser);

          return {
            id,
            email,
            name: [requestedFirstName, requestedLastName].filter(Boolean).join(" ") || email,
            firstName: requestedFirstName,
            lastName: requestedLastName,
          };
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
            [updatedFirstName, updatedLastName].filter(Boolean).join(" ") || updatedEmail,
          firstName: updatedFirstName,
          lastName: updatedLastName,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        if (user.email) {
          token.email = user.email;
        }
        if (user.name) {
          token.name = user.name;
        }
        token.firstName = "firstName" in user ? user.firstName : undefined;
        token.lastName = "lastName" in user ? user.lastName : undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = typeof token.id === "string" ? token.id : undefined;
        session.user.firstName =
          typeof token.firstName === "string" ? token.firstName : undefined;
        session.user.lastName =
          typeof token.lastName === "string" ? token.lastName : undefined;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
