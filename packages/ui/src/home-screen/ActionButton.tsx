import { Pressable, type StyleProp, Text, type ViewStyle } from "react-native";
import type { ActionTarget } from "../home-screen.data";
import styles from "../home-screen.styles";

interface ActionButtonProps {
	target: ActionTarget;
	onPress: (target: ActionTarget) => Promise<void> | void;
	style?: StyleProp<ViewStyle>;
}

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
