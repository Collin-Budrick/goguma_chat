import {
	DefaultTheme,
	type Theme,
	ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

const theme: Theme = {
	...DefaultTheme,
	dark: false,
	colors: {
		...DefaultTheme.colors,
		primary: "#111111",
		background: "#ffffff",
		card: "#ffffff",
		text: "#111111",
		border: "#e5e5e5",
		notification: "#111111",
	},
};

export default function RootLayout() {
	return (
		<ThemeProvider value={theme}>
			<Stack>
				<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			</Stack>
			<StatusBar style="auto" />
		</ThemeProvider>
	);
}
