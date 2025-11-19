"use client";

import Image from "next/image";
import { useLocale } from "next-intl";

import type { FriendRequestSummary } from "./types";
import { getContactName, getInitials } from "./types";

type FriendRequestListProps = {
	title: string;
	emptyLabel: string;
	badgeLabel: string;
	actionLabel: string;
	secondaryActionLabel?: string;
	formatTimestampLabel: (value: string) => string;
	requests: FriendRequestSummary[];
	type: "incoming" | "outgoing";
	pendingIds: Set<string>;
	onPrimaryAction: (request: FriendRequestSummary) => void;
	onSecondaryAction?: (request: FriendRequestSummary) => void;
};

function formatDate(value: string, locale: string) {
	try {
		const date = new Date(value);
		return new Intl.DateTimeFormat(locale, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(date);
	} catch {
		return value;
	}
}

function ContactAvatar({
	name,
	image,
	initials,
}: {
	name: string;
	image: string | null;
	initials: string;
}) {
	if (image) {
		return (
			<Image
				src={image}
				alt={name}
				className="h-9 w-9 rounded-full border border-white/20 object-cover"
				width={36}
				height={36}
				unoptimized
			/>
		);
	}

	return (
		<span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[11px] font-semibold uppercase tracking-wide text-white">
			{initials}
		</span>
	);
}

export default function FriendRequestList({
	title,
	emptyLabel,
	badgeLabel,
	actionLabel,
	secondaryActionLabel,
	formatTimestampLabel,
	requests,
	type,
	pendingIds,
	onPrimaryAction,
	onSecondaryAction,
}: FriendRequestListProps) {
	const locale = useLocale();

	return (
		<section className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/80">
			<header className="mb-4 flex items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold text-white">{title}</h2>
					<span className="mt-1 inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-white/60">
						{badgeLabel}
					</span>
				</div>
			</header>
			{requests.length === 0 ? (
				<p className="mt-auto rounded-2xl border border-white/10 bg-black/40 px-4 py-6 text-center text-sm text-white/50">
					{emptyLabel}
				</p>
			) : (
				<ul className="space-y-4">
					{requests.map((request) => {
						const counterparty =
							type === "incoming" ? request.sender : request.recipient;
						const name = getContactName(counterparty);
						const initials = getInitials(counterparty);
						const formatted = formatDate(request.createdAt, locale);
						const timestamp = formatTimestampLabel(formatted);
						const isPending = pendingIds.has(request.id);

						return (
							<li
								key={request.id}
								className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
							>
								<div className="flex items-center gap-3">
									<ContactAvatar
										name={name}
										image={counterparty.image}
										initials={initials}
									/>
									<div className="flex-1">
										<p className="font-medium text-white">{name}</p>
										<p className="text-xs text-white/50">{timestamp}</p>
									</div>
								</div>
								<div className="mt-3 flex flex-wrap items-center gap-2">
									<button
										type="button"
										onClick={() => onPrimaryAction(request)}
										disabled={isPending}
										className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/50 disabled:text-black/50"
									>
										{actionLabel}
									</button>
									{secondaryActionLabel && onSecondaryAction ? (
										<button
											type="button"
											onClick={() => onSecondaryAction(request)}
											disabled={isPending}
											className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
										>
											{secondaryActionLabel}
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
