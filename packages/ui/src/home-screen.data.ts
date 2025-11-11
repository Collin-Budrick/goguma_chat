export type LinkVariant = "primary" | "secondary";

export type LinkTarget = {
  title: string;
  href: string;
  description?: string;
};

export type ActionTarget = LinkTarget & {
  variant: LinkVariant;
};

export type ResourceTarget = LinkTarget & {
  description: string;
};

export type Highlight = {
  title: string;
  description: string;
};

export type ChatAuthor = "guest" | "guide";

export type ChatMessage = {
  id: string;
  from: ChatAuthor;
  text: string;
};

export const ACTIONS: ActionTarget[] = [
  {
    title: "Start the demo",
    href: "https://goguma.chat/demo",
    variant: "primary",
  },
  {
    title: "View pricing",
    href: "https://goguma.chat/pricing",
    variant: "secondary",
  },
];

export const HIGHLIGHTS: Highlight[] = [
  {
    title: "OLED-perfect presentation",
    description:
      "Deep blacks and crisp whites keep every conversation legible in any lighting.",
  },
  {
    title: "Human + AI rhythm",
    description:
      "Automations surface answers instantly while your team adds warmth in every reply.",
  },
  {
    title: "Always in sync",
    description:
      "Shared inboxes, transcripts, and insights stay aligned across web, mobile, and desktop.",
  },
];

export const RESOURCES: ResourceTarget[] = [
  {
    title: "Product walkthrough",
    description:
      "Tour the Goguma Chat workspace and see how teams stay responsive without the noise.",
    href: "https://goguma.chat/tour",
  },
  {
    title: "Download whitepaper",
    description:
      "Dive into the architecture that protects customer conversations end-to-end.",
    href: "https://goguma.chat/whitepaper",
  },
  {
    title: "Customer stories",
    description:
      "Learn how fast-moving teams keep satisfaction high with Goguma Chat.",
    href: "https://goguma.chat/stories",
  },
];

export const CHAT_PREVIEW: ChatMessage[] = [
  {
    id: "1",
    from: "guest",
    text: "Hi! Our export paused, can you help us bring it back online?",
  },
  {
    id: "2",
    from: "guide",
    text: "Absolutely. Checking the sync logs now. Give me just a moment.",
  },
  {
    id: "3",
    from: "guide",
    text: "All set. The job was waiting on a retry, so I nudged it forward for you.",
  },
  {
    id: "4",
    from: "guest",
    text: "Legend. Everything looks perfect again. Thanks for the quick rescue!",
  },
];
