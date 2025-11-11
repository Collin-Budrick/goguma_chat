import { Pressable, StyleProp, Text, ViewStyle } from "react-native";

import styles from "../home-screen.styles";
import type { ActionTarget } from "../home-screen.data";

type ActionButtonProps = {
  target: ActionTarget;
  onPress: (target: ActionTarget) => Promise<void> | void;
  style?: StyleProp<ViewStyle>;
};

export function ActionButton({ target, onPress, style }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => onPress(target)}
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
