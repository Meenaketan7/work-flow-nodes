// Lemma browser-client bootstrap for the DEPLOYED app (lemma.work).
//
// When Forge is served as a Lemma app, the host injects `window.__LEMMA_CONFIG__`
// (podId / apiUrl / authUrl) and serves the SDK at `<apiUrl>/public/sdk/lemma-client.js`.
// We load it, sign the user in, and expose the client so `forge-api.ts` can call our
// Lemma functions (forge_api / forge_generate) directly — no BFF.
//
// In LOCAL DEV there is no `__LEMMA_CONFIG__`; `isLemmaHosted()` is false and
// `forge-api.ts` keeps talking to the FastAPI BFF over REST.

export type FunctionRun = {
	id: string;
	status?: string; // PENDING | RUNNING | COMPLETED | FAILED | ...
	output_data?: unknown;
	error?: string | null;
};

export type LemmaClient = {
	initialize: () => Promise<{ status: string; user?: { name?: string; email?: string } }>;
	auth: {
		redirectToAuth: () => void;
		signOut: () => Promise<void>;
	};
	functions: {
		run: (name: string, options: { input?: unknown }) => Promise<FunctionRun>;
		runs: {
			get: (name: string, runId: string) => Promise<FunctionRun>;
		};
	};
};

type LemmaConfig = { podId?: string; apiUrl?: string; authUrl?: string };

declare global {
	interface Window {
		__LEMMA_CONFIG__?: LemmaConfig;
		LemmaClient?: { LemmaClient: new () => LemmaClient };
	}
}

export function isLemmaHosted(): boolean {
	return typeof window !== "undefined" && !!window.__LEMMA_CONFIG__;
}

let clientPromise: Promise<LemmaClient> | null = null;

function loadSdk(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (window.LemmaClient) return resolve();
		const cfg = window.__LEMMA_CONFIG__ ?? {};
		const base = (cfg.apiUrl ?? window.location.origin).replace(/\/$/, "");
		const s = document.createElement("script");
		s.src = `${base}/public/sdk/lemma-client.js`;
		s.onload = () => resolve();
		s.onerror = () => reject(new Error(`Failed to load the Lemma SDK from ${s.src}`));
		document.head.appendChild(s);
	});
}

// Load the SDK, construct the client, and ensure the user is authenticated.
// If they aren't, redirect to Lemma sign-in (this never resolves — we navigate away).
// Returns null when not hosted (local dev) so callers can fall back to REST.
export async function initLemma(): Promise<LemmaClient | null> {
	if (!isLemmaHosted()) return null;
	if (!clientPromise) {
		clientPromise = (async () => {
			await loadSdk();
			if (!window.LemmaClient) throw new Error("Lemma SDK loaded but LemmaClient missing");
			const client = new window.LemmaClient.LemmaClient();
			const auth = await client.initialize();
			if (auth?.status !== "authenticated") {
				client.auth.redirectToAuth();
				await new Promise<never>(() => {}); // halt: the page is navigating to sign-in
			}
			return client;
		})();
	}
	return clientPromise;
}

// Get the initialized client (must be hosted + initialized). Throws otherwise.
export async function getClient(): Promise<LemmaClient> {
	const c = await initLemma();
	if (!c) throw new Error("Lemma client unavailable (not running as a hosted app)");
	return c;
}
