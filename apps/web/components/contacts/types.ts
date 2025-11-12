export const FRIENDS_CACHE_KEY = "workspace.contacts";

export type ContactProfile = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  image: string | null;
};

export type FriendSummary = {
  friendshipId: string;
  friendId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  image: string | null;
  createdAt: string;
  hasConversation: boolean;
};

export type FriendRequestSummary = {
  id: string;
  status: string;
  senderId: string;
  recipientId: string;
  createdAt: string;
  updatedAt: string | null;
  respondedAt: string | null;
  sender: ContactProfile;
  recipient: ContactProfile;
};

export type ContactSearchMatch = ContactProfile & {
  createdAt: string;
};

export type ContactsState = {
  friends: FriendSummary[];
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
  lastSyncedAt?: string | null;
};

export function getContactName(profile: ContactProfile) {
  const first = profile.firstName?.trim();
  const last = profile.lastName?.trim();
  const full = [first, last].filter(Boolean).join(" ");

  if (full) {
    return full;
  }

  if (profile.email) {
    return profile.email;
  }

  return profile.id;
}

export function getInitials(profile: ContactProfile) {
  const first = profile.firstName?.trim();
  const last = profile.lastName?.trim();

  if (first || last) {
    const initials = [first, last]
      .filter(Boolean)
      .map((value) => value!.charAt(0).toUpperCase())
      .join("");

    if (initials) {
      return initials;
    }
  }

  if (profile.email) {
    return profile.email.charAt(0).toUpperCase();
  }

  return profile.id.charAt(0).toUpperCase();
}
