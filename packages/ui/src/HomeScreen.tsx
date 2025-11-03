import {
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

type LinkTarget = {
  title: string;
  description?: string;
  href: string;
  variant?: "primary" | "secondary";
};

type Highlight = {
  title: string;
  description: string;
};

type ChatMessage = {
  id: string;
  from: "guest" | "guide";
  text: string;
};

const ACTIONS: LinkTarget[] = [
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

const HIGHLIGHTS: Highlight[] = [
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

const RESOURCES: LinkTarget[] = [
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

const CHAT_PREVIEW: ChatMessage[] = [
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

async function openLink(target: LinkTarget) {
  try {
    const supported = await Linking.canOpenURL(target.href);
    if (supported) {
      await Linking.openURL(target.href);
    }
  } catch (error) {
    console.warn(`Failed to open link ${target.href}`, error);
  }
}

function ActionButton({
  target,
  style,
}: {
  target: LinkTarget;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => openLink(target)}
      style={({ pressed }) => [
        styles.actionButton,
        style,
        target.variant === "secondary"
          ? styles.actionButtonSecondary
          : styles.actionButtonPrimary,
        pressed && styles.actionButtonPressed,
      ]}
    >
      <Text
        style={[
          styles.actionLabel,
          target.variant === "secondary"
            ? styles.actionLabelSecondary
            : styles.actionLabelPrimary,
        ]}
      >
        {target.title}
      </Text>
    </Pressable>
  );
}

function ResourceCard({
  target,
  style,
}: {
  target: LinkTarget;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => openLink(target)}
      style={({ pressed }) => [
        styles.resourceCard,
        style,
        pressed && styles.resourceCardPressed,
      ]}
    >
      <Text style={styles.resourceTitle}>{target.title}</Text>
      {!!target.description && (
        <Text style={styles.resourceDescription}>{target.description}</Text>
      )}
      <Text style={styles.resourceHint}>Tap to learn more →</Text>
    </Pressable>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isGuide = message.from === "guide";
  return (
    <View
      style={[
        styles.messageBubble,
        isGuide ? styles.messageBubbleGuide : styles.messageBubbleGuest,
      ]}
    >
      <Text
        style={[
          styles.messageText,
          isGuide ? styles.messageTextDark : styles.messageTextLight,
        ]}
      >
        {message.text}
      </Text>
    </View>
  );
}

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.badge}>Goguma Chat</Text>
            <Text style={styles.heroTitle}>Pure focus. Every message.</Text>
            <Text style={styles.heroSubtitle}>
              A monochrome canvas tuned for OLED displays, where crisp contrast
              and thoughtful workflows help teams sound human at scale.
            </Text>
            <View style={styles.actions}>
              {ACTIONS.map((action, index) => (
                <ActionButton
                  key={action.href}
                  target={action}
                  style={index === 0 ? undefined : styles.actionButtonSpacing}
                />
              ))}
            </View>
          </View>

          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View style={styles.previewHeaderStart}>
                <View style={styles.previewDot} />
                <Text style={styles.previewLabel}>Live conversation</Text>
              </View>
              <Text style={styles.previewMeta}>Resolution: under 1 minute</Text>
            </View>
            <View style={styles.messageStack}>
              {CHAT_PREVIEW.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Why Goguma Chat</Text>
            <Text style={styles.sectionSubtitle}>
              Designed for teams who want clarity, calm, and speed in every
              thread.
            </Text>
            <View style={styles.highlightGroup}>
              {HIGHLIGHTS.map((highlight) => (
                <View key={highlight.title} style={styles.highlightCard}>
                  <Text style={styles.highlightTitle}>{highlight.title}</Text>
                  <Text style={styles.highlightDescription}>
                    {highlight.description}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Keep exploring</Text>
            <View style={styles.resources}>
              {RESOURCES.map((resource, index) => (
                <ResourceCard
                  key={resource.href}
                  target={resource}
                  style={
                    index === RESOURCES.length - 1
                      ? undefined
                      : styles.resourceSpacing
                  }
                />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 80,
    backgroundColor: "#000000",
  },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  hero: {
    marginBottom: 48,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 44,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.6,
    marginBottom: 14,
  },
  heroSubtitle: {
    fontSize: 18,
    lineHeight: 28,
    color: "rgba(255,255,255,0.66)",
    marginBottom: 32,
  },
  actions: {
    flexDirection: "column",
  },
  actionButton: {
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonSpacing: {
    marginTop: 12,
  },
  actionButtonPrimary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ffffff",
  },
  actionButtonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  actionButtonPressed: {
    opacity: 0.85,
  },
  actionLabel: {
    fontSize: 17,
    fontWeight: "600",
  },
  actionLabelPrimary: {
    color: "#000000",
  },
  actionLabelSecondary: {
    color: "#ffffff",
  },
  previewCard: {
    backgroundColor: "#050505",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 24,
    paddingVertical: 28,
    marginBottom: 56,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewHeaderStart: {
    flexDirection: "row",
    alignItems: "center",
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    marginRight: 12,
  },
  previewLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: "rgba(255,255,255,0.7)",
  },
  previewMeta: {
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
  },
  messageStack: {
    marginTop: 32,
  },
  messageBubble: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: "86%",
    marginBottom: 14,
  },
  messageBubbleGuide: {
    alignSelf: "flex-end",
    backgroundColor: "#ffffff",
    borderColor: "rgba(255,255,255,0.32)",
    borderBottomRightRadius: 6,
  },
  messageBubbleGuest: {
    alignSelf: "flex-start",
    backgroundColor: "#101010",
    borderColor: "rgba(255,255,255,0.12)",
    borderBottomLeftRadius: 6,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextDark: {
    color: "#050505",
  },
  messageTextLight: {
    color: "rgba(255,255,255,0.85)",
  },
  section: {
    marginBottom: 56,
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: "600",
    color: "#ffffff",
  },
  sectionSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: "rgba(255,255,255,0.62)",
    marginTop: 12,
  },
  highlightGroup: {
    marginTop: 28,
  },
  highlightCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#040404",
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  highlightTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
  },
  highlightDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: "rgba(255,255,255,0.65)",
    marginTop: 8,
  },
  resources: {
    marginTop: 32,
  },
  resourceSpacing: {
    marginBottom: 16,
  },
  resourceCard: {
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#070707",
  },
  resourceCardPressed: {
    opacity: 0.9,
  },
  resourceTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 10,
  },
  resourceDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: "rgba(255,255,255,0.62)",
    marginBottom: 12,
  },
  resourceHint: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
  },
});
