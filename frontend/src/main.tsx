import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import App from "./pages";
import { initLemma } from "./lib/lemma-client";

// When served as a hosted Lemma app, initialize the SDK + sign the user in BEFORE
// mounting (an unauthenticated visitor is redirected to Lemma sign-in and never
// reaches render). In local dev initLemma() resolves to null immediately and the
// app boots straight away against the local BFF.
async function boot() {
	try {
		await initLemma();
	} catch (err) {
		const root = document.getElementById("root");
		if (root) {
			root.innerHTML = `<div style="max-width:32rem;margin:20vh auto;padding:0 1rem;font-family:system-ui;text-align:center;color:#b91c1c"><h1 style="font-size:1.25rem">Couldn't start Forge</h1><p style="color:#6b7280">${(err as Error).message}</p></div>`;
		}
		return;
	}
	createRoot(document.getElementById("root")!).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}

void boot();
