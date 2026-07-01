import { ThemeProvider } from "@/components/ui/theme-provider";
import { ForgeScreen } from "@/components/forge/forge-screen";
import { Toaster } from "@/components/ui/sonner";

function App() {
	// Forge is the whole app now: one unified 3-pane screen. The legacy pipeline
	// code stays in the repo but is no longer routed.
	return (
		<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
			<ForgeScreen />
			<Toaster />
		</ThemeProvider>
	);
}

export default App;
