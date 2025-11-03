"use client";

import type { Session } from "next-auth";
import { signOut } from "next-auth/react";

interface UserMenuProps {
  user: Session["user"];
}

function getInitials(user: Session["user"]) {
  const first = user.firstName?.[0];
  const last = user.lastName?.[0];
  if (first || last) {
    return `${first ?? ""}${last ?? ""}`.toUpperCase();
  }
  const nameInitial = user.name?.[0];
  if (nameInitial) return nameInitial.toUpperCase();
  const emailInitial = user.email?.[0];
  return emailInitial ? emailInitial.toUpperCase() : "?";
}

export default function UserMenu({ user }: UserMenuProps) {
  const initials = getInitials(user);

  return (
    <div className="flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-3 py-1.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold uppercase">
        {initials}
      </div>
      <div className="hidden text-left text-xs md:block">
        <p className="font-semibold text-white">{user.name ?? user.email ?? "Anonymous"}</p>
        {user.email ? (
          <p className="text-white/60">{user.email}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="text-xs uppercase tracking-[0.25em] text-white/60 transition hover:text-white"
      >
        Sign out
      </button>
    </div>
  );
}
