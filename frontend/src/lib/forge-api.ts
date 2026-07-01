// Typed fetch client for the Forge BFF (backend/main.py). The browser stays
// tokenless — all Lemma access happens server-side. Base URL comes from
// VITE_FORGE_API_URL and falls back to the local BFF so it works with zero config.
//
// STATUS: UNVERIFIED end-to-end — needs the BFF running AND Lemma Cloud reachable.

const BASE =
	(import.meta.env.VITE_FORGE_API_URL as string | undefined) ?? "http://127.0.0.1:8000";

export type ForgeNodeData = {
	slug: string;
	title: string;
	summary: string;
	layer: string;
	kind: string;
	status: string;
};

export type RFNode = {
	id: string;
	type: string;
	position: { x: number; y: number };
	data: ForgeNodeData;
};

export type RFEdge = { id: string; source: string; target: string };
export type Graph = { nodes: RFNode[]; edges: RFEdge[] };

export type Task = {
	id?: string;
	node_id: string;
	title: string;
	status: string;
	approval_state: string;
	priority: number;
};

export type Project = {
	id: string;
	name: string;
	status: string;
	design_locked: boolean;
	summary?: string;
	prompt?: string;
	created_at?: string;
};

export type GenerateResult = {
	project_id: string;
	summary: string;
	counts: { nodes: number; edges: number; tasks: number };
	graph: Graph;
};

export type ProjectDetail = { project: Project; graph: Graph; tasks: Task[] };

// Streaming generation progress events (SSE from /api/generate/stream).
export type GenStreamEvent =
	| { stage: "grounding" }
	| { stage: "grounded"; chars: number }
	| { stage: "decompose" }
	| { stage: "decomposed"; nodes: number; edges: number }
	| { stage: "refine" }
	| { stage: "persisting"; nodes: number; edges: number; tasks: number }
	| {
			stage: "done";
			project_id: string;
			summary: string;
			counts: { nodes: number; edges: number; tasks: number };
	  }
	| { stage: "error"; detail: string };

export type GenStreamDone = Extract<GenStreamEvent, { stage: "done" }>;

export type Guidance = {
	cached: boolean;
	thread_id?: string;
	node_id: string;
	question: string;
	guidance_md: string;
	structured: {
		steps?: string[];
		checklist?: string[];
		watch_out?: string[];
		tech?: string[];
	};
	sources: string[];
};

export type LockResult = {
	design_locked: boolean;
	nodes_moved_to_building?: number;
	tasks_approved?: number;
	already_locked?: boolean;
};

export type ExportResult = {
	pushed: boolean;
	file_count?: number;
	files?: string[];
	repo_url?: string;
};

export type DigestResult = {
	project_id: string;
	state: {
		shipped: string[];
		in_progress: string[];
		blocked: { node: string; waiting_on: string[] }[];
		ready_next: string[];
		open_tasks: number;
	};
	structured: Record<string, unknown>;
	digest_md: string;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		headers: { "Content-Type": "application/json" },
		...init,
	});
	if (!res.ok) {
		let detail = `${res.status} ${res.statusText}`;
		try {
			const body = (await res.json()) as { detail?: string };
			if (body?.detail) detail = body.detail;
		} catch {
			/* non-JSON error body — keep the status text */
		}
		throw new Error(detail);
	}
	return (await res.json()) as T;
}

export const forgeApi = {
	generate: (prompt: string, name?: string) =>
		req<GenerateResult>("/api/generate", {
			method: "POST",
			body: JSON.stringify({ prompt, name }),
		}),
	// Streaming generation: emits progress events; resolves with the final "done"
	// event. Pass a signal to abort (the server stops before persisting on disconnect).
	async generateStream(
		prompt: string,
		opts: {
			onProgress?: (ev: GenStreamEvent) => void;
			signal?: AbortSignal;
			name?: string;
		} = {},
	): Promise<GenStreamDone> {
		const res = await fetch(`${BASE}/api/generate/stream`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prompt, name: opts.name }),
			signal: opts.signal,
		});
		if (!res.ok || !res.body) {
			throw new Error(`${res.status} ${res.statusText}`);
		}
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buf = "";
		let done: GenStreamDone | null = null;
		for (;;) {
			const { value, done: streamDone } = await reader.read();
			if (streamDone) break;
			buf += decoder.decode(value, { stream: true });
			let sep: number;
			while ((sep = buf.indexOf("\n\n")) >= 0) {
				const frame = buf.slice(0, sep);
				buf = buf.slice(sep + 2);
				const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
				if (!dataLine) continue;
				const payload = dataLine.slice(5).trim();
				if (!payload) continue;
				let ev: GenStreamEvent;
				try {
					ev = JSON.parse(payload) as GenStreamEvent;
				} catch {
					continue;
				}
				if (ev.stage === "error") throw new Error(ev.detail || "generation failed");
				opts.onProgress?.(ev);
				if (ev.stage === "done") done = ev;
			}
		}
		if (!done) throw new Error("generation ended without a result");
		return done;
	},
	listProjects: () => req<{ projects: Project[] }>("/api/projects"),
	getProject: (id: string) => req<ProjectDetail>(`/api/projects/${id}`),
	guidance: (projectId: string, nodeId: string, question?: string, refresh = false) =>
		req<Guidance>("/api/guidance", {
			method: "POST",
			body: JSON.stringify({
				project_id: projectId,
				node_id: nodeId,
				question,
				refresh,
			}),
		}),
	setStatus: (projectId: string, nodeId: string, status: string) =>
		req<{ node_id: string; status: string }>("/api/nodes/status", {
			method: "POST",
			body: JSON.stringify({ project_id: projectId, node_id: nodeId, status }),
		}),
	lock: (id: string) => req<LockResult>(`/api/projects/${id}/lock`, { method: "POST" }),
	unlock: (id: string) =>
		req<LockResult>(`/api/projects/${id}/unlock`, { method: "POST" }),
	exportRepo: (id: string) =>
		req<ExportResult>(`/api/projects/${id}/export`, {
			method: "POST",
			body: JSON.stringify({ push: false }),
		}),
	digest: (id: string) => req<DigestResult>(`/api/projects/${id}/digest`, { method: "POST" }),

	// ---- manual editing (persisted) ----
	createProject: (name: string, prompt?: string) =>
		req<{ project: Project }>("/api/projects", {
			method: "POST",
			body: JSON.stringify({ name, prompt }),
		}),
	createNode: (
		projectId: string,
		body: {
			layer: string;
			kind: string;
			title: string;
			summary?: string;
			pos_x: number;
			pos_y: number;
		},
	) =>
		req<{ node: RFNode }>(`/api/projects/${projectId}/nodes`, {
			method: "POST",
			body: JSON.stringify(body),
		}),
	updateNode: (
		projectId: string,
		slug: string,
		patch: Partial<{
			title: string;
			summary: string;
			layer: string;
			status: string;
			pos_x: number;
			pos_y: number;
		}>,
	) =>
		req<{ node: RFNode }>(`/api/projects/${projectId}/nodes/${slug}`, {
			method: "PATCH",
			body: JSON.stringify(patch),
		}),
	deleteNode: (projectId: string, slug: string) =>
		req<{ deleted: string; edges_removed: number; tasks_removed: number }>(
			`/api/projects/${projectId}/nodes/${slug}`,
			{ method: "DELETE" },
		),
	createEdge: (projectId: string, source: string, target: string) =>
		req<{ edge: RFEdge }>(`/api/projects/${projectId}/edges`, {
			method: "POST",
			body: JSON.stringify({ source, target }),
		}),
	deleteEdge: (projectId: string, edgeId: string) =>
		req<{ deleted: string }>(`/api/projects/${projectId}/edges/${edgeId}`, {
			method: "DELETE",
		}),
	relayout: (projectId: string) =>
		req<ProjectDetail>(`/api/projects/${projectId}/relayout`, { method: "POST" }),
};
