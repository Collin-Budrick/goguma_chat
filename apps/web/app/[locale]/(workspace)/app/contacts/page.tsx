import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import ContactsClient from "@/components/contacts/ContactsClient";
import { FRIENDS_CACHE_KEY, type ContactsState } from "@/components/contacts/types";
import WorkspacePageShell from "@/components/workspace-page-shell";
import { getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "WorkspaceContacts" });
  return {
    title: t("metadata.title"),
  };
}

function toISODate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function serializeState(state: Awaited<ReturnType<typeof getFriendState>>): ContactsState {
  return {
    friends: state.friends.map((friend) => ({
      friendshipId: friend.friendshipId,
      friendId: friend.friendId,
      email: friend.email,
      firstName: friend.firstName,
      lastName: friend.lastName,
      image: friend.image,
      createdAt: toISODate(friend.createdAt) ?? new Date().toISOString(),
      hasConversation: friend.hasConversation ?? false,
    })),
    incoming: state.incoming.map((request) => ({
      id: request.id,
      status: request.status,
      senderId: request.senderId,
      recipientId: request.recipientId,
      createdAt: toISODate(request.createdAt) ?? new Date().toISOString(),
      updatedAt: toISODate(request.updatedAt),
      respondedAt: toISODate(request.respondedAt),
      sender: {
        id: request.sender.id,
        email: request.sender.email,
        firstName: request.sender.firstName,
        lastName: request.sender.lastName,
        image: request.sender.image,
      },
      recipient: {
        id: request.recipient.id,
        email: request.recipient.email,
        firstName: request.recipient.firstName,
        lastName: request.recipient.lastName,
        image: request.recipient.image,
      },
    })),
    outgoing: state.outgoing.map((request) => ({
      id: request.id,
      status: request.status,
      senderId: request.senderId,
      recipientId: request.recipientId,
      createdAt: toISODate(request.createdAt) ?? new Date().toISOString(),
      updatedAt: toISODate(request.updatedAt),
      respondedAt: toISODate(request.respondedAt),
      sender: {
        id: request.sender.id,
        email: request.sender.email,
        firstName: request.sender.firstName,
        lastName: request.sender.lastName,
        image: request.sender.image,
      },
      recipient: {
        id: request.recipient.id,
        email: request.recipient.email,
        firstName: request.recipient.firstName,
        lastName: request.recipient.lastName,
        image: request.recipient.image,
      },
    })),
    lastSyncedAt: new Date().toISOString(),
  };
}

export default function ContactsPage(props: PageProps) {
  return (
    <Suspense fallback={<WorkspacePageShell lines={6} />}>
      <ContactsPageContent {...props} />
    </Suspense>
  );
}

async function ContactsPageContent({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  const userId = session.user.id;
  const state = await getFriendState(userId);
  const initialState = serializeState(state);

  return (
    <ContactsClient
      cacheKey={`${FRIENDS_CACHE_KEY}:${userId}`}
      viewerId={userId}
      initialState={initialState}
    />
  );
}
