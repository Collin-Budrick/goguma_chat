import { Pressable, type StyleProp, Text, type ViewStyle } from "react-native";
import type { ResourceTarget } from "../home-screen.data";
import styles from "../home-screen.styles";

type ResourceCardProps = {
	target: ResourceTarget;
	onPress: (target: ResourceTarget) => Promise<void> | void;
	style?: StyleProp<ViewStyle>;
};

export function ResourceCard({ target, onPress, style }: ResourceCardProps) {
	return (
		<Pressable
			accessibilityRole="link"
			onPress={() => onPress(target)}
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
