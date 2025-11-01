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
  useColorScheme,
} from "react-native";

type LinkTarget = {
  title: string;
  description?: string;
  href: string;
  variant?: "primary" | "secondary";
};

const ACTIONS: LinkTarget[] = [
  {
    title: "Browse Templates",
    href: "https://vercel.com/templates?framework=next.js&utm_source=goguma-chat",
    variant: "primary",
  },
  {
    title: "Read the Docs",
    href: "https://nextjs.org/docs",
    variant: "secondary",
  },
];

const RESOURCES: LinkTarget[] = [
  {
    title: "Learn Next.js",
    description:
      "Deep dive into App Router fundamentals, data fetching, and performance best practices.",
    href: "https://nextjs.org/learn",
  },
  {
    title: "Expo + Next.js Guide",
    description:
      "Understand how Expo and React Native Web fit together for truly cross-platform UIs.",
    href: "https://docs.expo.dev/guides/using-nextjs/",
  },
  {
    title: "Hermes V1 Overview",
    description:
      "Track the latest updates to Hermes and how it improves mobile runtime performance.",
    href: "https://reactnative.dev/docs/hermes",
  },
];

const HERO_IMAGE =
  "https://raw.githubusercontent.com/vercel/next.js/canary/packages/create-next-app/templates/app-tw/public/next.svg";

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
        [
          styles.resourceCard,
          {
            backgroundColor: "rgba(24,24,27,0.05)",
            borderColor: "#e4e4e7",
          },
        ],
        style,
        pressed && styles.resourceCardPressed,
      ]}
    >
      <Text
        style={[
          styles.resourceTitle,
          { color: "#111111" },
        ]}
      >
        {target.title}
      </Text>
      {!!target.description && (
        <Text
          style={[
            styles.resourceDescription,
            { color: "#52525b" },
          ]}
        >
          {target.description}
        </Text>
      )}
      <Text
        style={[
          styles.resourceHint,
          { color: "#2563eb" },
        ]}
      >
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
        { backgroundColor: "#ffffff" },
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
              backgroundColor: "#ffffff",
              borderColor: "#e4e4e7",
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
            <Text
              style={[styles.title, { color: "#111111" }]}
            >
              Build once, ship everywhere.
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: "#3f3f46" },
              ]}
            >
              Edit the shared UI package to update both the Next.js web app and
              the Expo mobile app instantly.
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
                styles.sectionTitle
              ]}
            >
              Continue exploring
            </Text>
            <View style={styles.resources}>
              {RESOURCES.map((resource) => (
                <ResourceCard
                  key={resource.href}
                  target={resource}
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
  },
  card: {
    borderRadius: 24,
    padding: 32,
    alignSelf: "center",
    width: "100%",
    maxWidth: 640,
    alignItems: "stretch",
    borderWidth: 1,
    boxShadow: "0px 18px 20px rgba(0, 0, 0, 0.15)",
    elevation: 6,
  },
  heroImageWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  heroImage: {
    height: 32,
    width: 160,
  },
  header: {
    alignItems: "center",
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  actions: {
    marginBottom: 28,
  },
  actionButton: {
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  actionButtonSpacing: {
    marginBottom: 12,
  },
  actionButtonPrimary: {
    backgroundColor: "#111111",
  },
  actionButtonSecondary: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    backgroundColor: "#ffffff",
  },
  actionButtonPressed: {
    opacity: 0.85,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  actionLabelPrimary: {
    color: "#ffffff",
  },
  actionLabelSecondary: {
    color: "#111111",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  resources: {
    marginBottom: 4,
  },
  resourceCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  resourceSpacing: {
    marginBottom: 12,
  },
  resourceCardPressed: {
    opacity: 0.9,
  },
  resourceTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111111",
  },
  resourceDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: "#52525b",
  },
  resourceHint: {
    fontSize: 13,
    color: "#2563eb",
    fontWeight: "600",
  },
});
