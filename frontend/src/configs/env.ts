export const env = {
	apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string,
	apiKey: import.meta.env.VITE_API_KEY as string,
	mode: import.meta.env.MODE as string
};

if (!env.apiBaseUrl) throw new Error("Missing VITE_API_BASE_URL");
if (!env.apiKey) throw new Error("Missing VITE_API_KEY");
