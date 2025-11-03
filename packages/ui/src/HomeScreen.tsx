import {
  Image,
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

const ACTIONS: LinkTarget[] = [
  {
    title: "Get Started",
    href: "https://goguma.chat/start",
    variant: "primary",
  },
  {
    title: "See Features",
    href: "https://goguma.chat/features",
    variant: "secondary",
  },
];

const RESOURCES: LinkTarget[] = [
  {
    title: "Why Goguma Chat",
    description:
      "Discover how our sweet-potato-simple workflows keep every conversation warm and productive.",
    href: "https://goguma.chat/benefits",
  },
  {
    title: "Integrations",
    description:
      "Connect your favorite tools and automate hand-offs with rich CRM, calendar, and AI partners.",
    href: "https://goguma.chat/integrations",
  },
  {
    title: "Security & Trust",
    description:
      "Review the safeguards that keep customer data protected across every team and device.",
    href: "https://goguma.chat/security",
  },
];

const HERO_SVG = `<svg width="320" height="160" viewBox="0 0 320 160" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gogumaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5b21b6" />
      <stop offset="100%" stop-color="#fb923c" />
    </linearGradient>
  </defs>
  <rect x="12" y="16" width="296" height="128" rx="28" fill="url(#gogumaGradient)" />
  <g fill="#ffffff" font-family="'Inter', 'Helvetica Neue', Arial, sans-serif">
    <text x="160" y="80" font-size="44" font-weight="700" text-anchor="middle">Goguma</text>
    <text x="160" y="116" font-size="28" font-weight="500" opacity="0.92" text-anchor="middle">Chat</text>
  </g>
  <circle cx="62" cy="64" r="18" fill="#fef9c3" opacity="0.92" />
  <circle cx="258" cy="108" r="12" fill="#fef3c7" opacity="0.85" />
  <circle cx="240" cy="52" r="8" fill="#ede9fe" opacity="0.8" />
</svg>`;

const HERO_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(HERO_SVG)}`;

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
      <Text style={styles.resourceTitle}>
        {target.title}
      </Text>
      {!!target.description && (
        <Text style={styles.resourceDescription}>
          {target.description}
        </Text>
      )}
      <Text style={styles.resourceHint}>
        Tap to learn more →
      </Text>
    </Pressable>
  );
}

export function HomeScreen() {

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: "#f3f0ff" },
      ]}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: "#f8f5ff",
              borderColor: "#e0d7ff",
            },
          ]}
        >
          <View style={styles.heroImageWrapper}>
            <Image
              source={{ uri: HERO_IMAGE }}
              resizeMode="contain"
              style={styles.heroImage}
            />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: "#1f1a3d" }]}>
              Conversations that feel hand-crafted.
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: "#3c366b" },
              ]}
            >
              Goguma Chat blends delightful design with AI-guided workflows so
              teams can respond faster, stay human, and grow every relationship.
            </Text>
          </View>

          <View style={styles.actions}>
            {ACTIONS.map((action, index) => (
              <ActionButton
                key={action.href}
                target={action}
                style={
                  index === ACTIONS.length - 1
                    ? undefined
                    : styles.actionButtonSpacing
                }
              />
            ))}
          </View>

          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                { color: "#1f1a3d" },
              ]}
            >
              Keep exploring
            </Text>
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
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 36,
    backgroundColor: "#f3f0ff",
  },
  card: {
    borderRadius: 28,
    paddingVertical: 40,
    paddingHorizontal: 36,
    alignSelf: "center",
    width: "100%",
    maxWidth: 680,
    alignItems: "stretch",
    borderWidth: 1,
    boxShadow: "0px 20px 24px rgba(31, 26, 61, 0.18)",
    elevation: 8,
  },
  heroImageWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  heroImage: {
    height: 120,
    width: "90%",
    maxWidth: 320,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.8,
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 26,
    textAlign: "center",
  },
  actions: {
    marginBottom: 32,
  },
  actionButton: {
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonSpacing: {
    marginBottom: 12,
  },
  actionButtonPrimary: {
    backgroundColor: "#5b21b6",
  },
  actionButtonSecondary: {
    borderWidth: 2,
    borderColor: "#7c3aed",
    backgroundColor: "#f9f6ff",
  },
  actionButtonPressed: {
    opacity: 0.9,
  },
  actionLabel: {
    fontSize: 17,
    fontWeight: "600",
  },
  actionLabelPrimary: {
    color: "#ffffff",
  },
  actionLabelSecondary: {
    color: "#5b21b6",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 14,
  },
  resources: {
    marginBottom: 4,
  },
  resourceSpacing: {
    marginBottom: 12,
  },
  resourceCard: {
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    borderColor: "#d7cff9",
  },
  resourceCardPressed: {
    opacity: 0.96,
  },
  resourceTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1f1a3d",
    marginBottom: 4,
  },
  resourceDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: "#3c366b",
    marginBottom: 12,
  },
  resourceHint: {
    fontSize: 13,
    color: "#5b21b6",
    fontWeight: "600",
  },
});
