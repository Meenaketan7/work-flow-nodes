import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	process.env = { ...process.env, ...env };

	return {
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "src"),
				"~": path.resolve(__dirname)
			}
		},
		plugins: [react(), tailwindcss()],
		server: {
			port: 3000
		}
	};
});
