import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "CLERK_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  const payload = await req.text();
  const headerList = await headers();

  const svixId = headerList.get("svix-id");
  const svixTimestamp = headerList.get("svix-timestamp");
  const svixSignature = headerList.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing Svix signature headers" },
      { status: 400 },
    );
  }

  const webhook = new Webhook(WEBHOOK_SECRET);

  let event: WebhookEvent;

  try {
    event = webhook.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (error) {
    console.error("Clerk webhook signature verification failed", error);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const { type } = event;

  try {
    if (type === "user.created" || type === "user.updated") {
      const { id, email_addresses, first_name, last_name } = event.data;
      const primaryEmail = email_addresses?.[0]?.email_address;

      if (!primaryEmail) {
        return NextResponse.json({ received: true });
      }

      const timestamp = new Date();

      await db
        .insert(users)
        .values({
          id,
          email: primaryEmail,
          firstName: first_name ?? null,
          lastName: last_name ?? null,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: primaryEmail,
            firstName: first_name ?? null,
            lastName: last_name ?? null,
            updatedAt: timestamp,
          },
        });
    } else if (type === "user.deleted") {
      const userId = event.data.id;
      await db.delete(users).where(eq(users.id, userId));
    }
  } catch (error) {
    console.error("Clerk webhook handler failed", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
