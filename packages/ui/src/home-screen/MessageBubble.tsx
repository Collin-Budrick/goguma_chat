import { Text, View } from "react-native";

import styles from "../home-screen.styles";
import type { ChatMessage } from "../home-screen.data";

type MessageBubbleProps = {
  message: ChatMessage;
};

export function MessageBubble({ message }: MessageBubbleProps) {
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
