import { useState } from "react";

import MainScreen from "./screens/MainScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { useEsp32Controller } from "./hooks/useEsp32Controller";

export default function App() {
	const controller = useEsp32Controller();
	const [activeScreen, setActiveScreen] = useState<"stream" | "settings">("stream");

	if (activeScreen === "settings") {
		return (
			<SettingsScreen
				controller={controller}
				onClose={() => setActiveScreen("stream")}
			/>
		);
	}

	return (
		<MainScreen
			controller={controller}
			onOpenSettings={() => setActiveScreen("settings")}
		/>
	);
}
