import { Linking, SafeAreaView, ScrollView, Text, View } from "react-native";

import {
  ACTIONS,
  CHAT_PREVIEW,
  HIGHLIGHTS,
  RESOURCES,
  type LinkTarget,
} from "./home-screen.data";
import { ActionButton, MessageBubble, ResourceCard } from "./home-screen";
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
                  onPress={openLink}
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
                  onPress={openLink}
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

export { ActionButton, MessageBubble, ResourceCard } from "./home-screen";

