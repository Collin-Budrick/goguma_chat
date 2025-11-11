import {
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from "react-native";

import {
  ACTIONS,
  CHAT_PREVIEW,
  HIGHLIGHTS,
  RESOURCES,
  type ChatMessage,
  type LinkTarget,
} from "./home-screen.data";
import styles from "./home-screen.styles";

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

