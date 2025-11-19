"use client";

import Image from "next/image";
import { useLocale } from "next-intl";

import type { FriendSummary } from "./types";
import { getContactName, getInitials } from "./types";

type FriendListProps = {
	friends: FriendSummary[];
	isSyncing: boolean;
	title: string;
	emptyLabel: string;
	countLabel: string;
	syncingLabel: string;
	formatSinceLabel: (value: string) => string;
	onRemove?: (friend: FriendSummary) => void;
	pendingIds?: Set<string>;
	removeLabel?: string;
	removingLabel?: string;
};

function formatDate(value: string, locale: string) {
	try {
		const date = new Date(value);
		return new Intl.DateTimeFormat(locale, {
			dateStyle: "medium",
		}).format(date);
	} catch {
		return value;
	}
}

type ContactAvatarProps = {
	name: string;
	image: string | null;
	initials: string;
};

function ContactAvatar({ name, image, initials }: ContactAvatarProps) {
	if (image) {
		return (
			<Image
				src={image}
				alt={name}
				className="h-10 w-10 rounded-full border border-white/20 object-cover"
				width={40}
				height={40}
				unoptimized
			/>
		);
	}

	return (
		<span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold text-white">
			{initials}
		</span>
	);
}

export default function FriendList({
	friends,
	isSyncing,
	title,
	emptyLabel,
	countLabel,
	syncingLabel,
	formatSinceLabel,
	onRemove,
	pendingIds,
	removeLabel,
	removingLabel,
}: FriendListProps) {
	const locale = useLocale();
	const canRemove = typeof onRemove === "function";

	return (
		<section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/80">
			<header className="mb-4 flex items-center justify-between gap-4">
				<div>
					<h2 className="text-lg font-semibold text-white">{title}</h2>
					<p className="text-xs text-white/50">{countLabel}</p>
				</div>
				{isSyncing ? (
					<span className="text-xs uppercase tracking-[0.3em] text-white/40">
						{syncingLabel}
					</span>
				) : null}
			</header>
			{friends.length === 0 ? (
				<p className="rounded-2xl border border-white/10 bg-black/40 px-4 py-6 text-center text-sm text-white/50">
					{emptyLabel}
				</p>
			) : (
				<ul className="space-y-4">
					{friends.map((friend) => {
						const name = getContactName({
							id: friend.friendId,
							email: friend.email,
							firstName: friend.firstName,
							lastName: friend.lastName,
							image: friend.image,
						});
						const initials = getInitials({
							id: friend.friendId,
							email: friend.email,
							firstName: friend.firstName,
							lastName: friend.lastName,
							image: friend.image,
						});
						const formattedDate = formatDate(friend.createdAt, locale);
						const sinceLabel = formatSinceLabel(formattedDate);

						return (
							<li
								key={friend.friendshipId}
								className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
							>
								<div className="flex items-center gap-3">
									<ContactAvatar
										name={name}
										image={friend.image}
										initials={initials}
									/>
									<div>
										<p className="font-medium text-white">{name}</p>
										{friend.email ? (
											<p className="text-xs text-white/50">{friend.email}</p>
										) : null}
									</div>
								</div>
								<div className="flex flex-col items-end gap-2 text-right">
									<p className="text-xs text-white/40">{sinceLabel}</p>
									{canRemove ? (
										<button
											type="button"
											onClick={() => onRemove?.(friend)}
											disabled={pendingIds?.has(friend.friendshipId)}
											className="text-xs uppercase tracking-[0.3em] text-white/50 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
										>
											{pendingIds?.has(friend.friendshipId)
												? (removingLabel ?? "Removing…")
												: (removeLabel ?? "Remove")}
										</button>
									) : null}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
