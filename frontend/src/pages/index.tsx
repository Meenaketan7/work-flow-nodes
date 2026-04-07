import { ThemeProvider } from "@/components/ui/theme-provider";
import WorkFlow from "./work-flow";
import Layout from "@/components/ui/layout";
import { Toaster } from "@/components/ui/sonner";
function App() {
	return (
		<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
			<Layout>
				<WorkFlow />
			</Layout>
			<Toaster />
		</ThemeProvider>
	);
}

export default App;
