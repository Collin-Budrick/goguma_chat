import { StyleSheet } from "react-native";

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

export { styles };
export default styles;
