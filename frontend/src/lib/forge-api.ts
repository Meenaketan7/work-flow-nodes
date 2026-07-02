// Typed client for Forge. Two transports, same shapes:
//   • DEPLOYED (lemma.work app): calls the Lemma functions forge_api / forge_generate
//     directly via the browser SDK — no server of our own. `isLemmaHosted()` is true.
//   • LOCAL DEV: talks to the FastAPI BFF (backend/main.py) over REST at
//     VITE_FORGE_API_URL (default http://127.0.0.1:8000).
// Every method returns the identical shape in both modes, so the UI is transport-agnostic.

import { getClient, isLemmaHosted, type FunctionRun } from "./lemma-client";

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

// ---------------------------------------------------------------- REST (local BFF)
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

// ---------------------------------------------------------------- functions (hosted)
type Envelope = { ok: boolean; error?: string | null; code?: number | null; data?: unknown };

function unwrap(run: FunctionRun): unknown {
	if (run?.status === "FAILED" || run?.error) {
		throw new Error(run?.error || "function run failed");
	}
	const out = (run?.output_data ?? run) as Envelope;
	if (out && out.ok === false) throw new Error(out.error || "request failed");
	return out?.data;
}

// Call the forge_api dispatcher function and unwrap its {ok, data} envelope.
async function callApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
	const client = await getClient();
	const run = await client.functions.run("forge_api", { input: { action, ...payload } });
	return unwrap(run) as T;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const t = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(t);
				reject(new DOMException("Aborted", "AbortError"));
			},
			{ once: true },
		);
	});
}

type GenJobOutput = {
	ok?: boolean;
	error?: string | null;
	project_id?: string;
	summary?: string;
	counts?: { nodes: number; edges: number; tasks: number };
};

// Run the forge_generate JOB and poll it to completion, emitting synthetic progress
// events (the hosted transport can't stream live stages the way the SSE BFF does).
async function runGenerateJob(
	prompt: string,
	name: string | undefined,
	opts: { onProgress?: (ev: GenStreamEvent) => void; signal?: AbortSignal } = {},
): Promise<GenStreamDone> {
	const client = await getClient();
	const emit = (ev: GenStreamEvent) => opts.onProgress?.(ev);
	emit({ stage: "grounding" });
	const run = await client.functions.run("forge_generate", { input: { prompt, name } });
	emit({ stage: "decompose" });

	let cur = run;
	const deadline = Date.now() + 15 * 60 * 1000;
	let ticks = 0;
	while (cur.status !== "COMPLETED" && cur.status !== "FAILED") {
		if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
		if (Date.now() > deadline) throw new Error("generation timed out");
		await sleep(4000, opts.signal);
		if (++ticks === 3) emit({ stage: "refine" });
		cur = await client.functions.runs.get("forge_generate", run.id);
	}
	if (cur.status === "FAILED") throw new Error(cur.error || "generation failed");

	const out = (cur.output_data ?? {}) as GenJobOutput;
	if (!out.ok || !out.project_id) throw new Error(out.error || "generation returned no project");
	const counts = out.counts ?? { nodes: 0, edges: 0, tasks: 0 };
	emit({ stage: "persisting", nodes: counts.nodes, edges: counts.edges, tasks: counts.tasks });
	const done: GenStreamDone = {
		stage: "done",
		project_id: out.project_id,
		summary: out.summary ?? "",
		counts,
	};
	emit(done);
	return done;
}

// SSE streaming generation against the local BFF (live stages + abort).
async function generateStreamRest(
	prompt: string,
	opts: { onProgress?: (ev: GenStreamEvent) => void; signal?: AbortSignal; name?: string },
): Promise<GenStreamDone> {
	const res = await fetch(`${BASE}/api/generate/stream`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ prompt, name: opts.name }),
		signal: opts.signal,
	});
	if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`);
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
}

// ---------------------------------------------------------------- public API
export const forgeApi = {
	generate: async (prompt: string, name?: string): Promise<GenerateResult> => {
		if (!isLemmaHosted())
			return req<GenerateResult>("/api/generate", {
				method: "POST",
				body: JSON.stringify({ prompt, name }),
			});
		const done = await runGenerateJob(prompt, name);
		const detail = await callApi<ProjectDetail>("project", { project_id: done.project_id });
		return {
			project_id: done.project_id,
			summary: done.summary,
			counts: done.counts,
			graph: detail.graph,
		};
	},
	// Generation with progress: SSE against the local BFF, or a polled JOB when hosted.
	// Resolves with the final "done" event; pass a signal to abort.
	generateStream: (
		prompt: string,
		opts: {
			onProgress?: (ev: GenStreamEvent) => void;
			signal?: AbortSignal;
			name?: string;
		} = {},
	): Promise<GenStreamDone> =>
		isLemmaHosted()
			? runGenerateJob(prompt, opts.name, opts)
			: generateStreamRest(prompt, opts),

	listProjects: () =>
		isLemmaHosted()
			? callApi<{ projects: Project[] }>("projects")
			: req<{ projects: Project[] }>("/api/projects"),
	getProject: (id: string) =>
		isLemmaHosted()
			? callApi<ProjectDetail>("project", { project_id: id })
			: req<ProjectDetail>(`/api/projects/${id}`),
	guidance: (projectId: string, nodeId: string, question?: string, refresh = false) =>
		isLemmaHosted()
			? callApi<Guidance>("guidance", {
					project_id: projectId,
					node_id: nodeId,
					question,
					refresh,
				})
			: req<Guidance>("/api/guidance", {
					method: "POST",
					body: JSON.stringify({ project_id: projectId, node_id: nodeId, question, refresh }),
				}),
	setStatus: (projectId: string, nodeId: string, status: string) =>
		isLemmaHosted()
			? callApi<{ node_id: string; status: string }>("node_status", {
					project_id: projectId,
					node_id: nodeId,
					status,
				})
			: req<{ node_id: string; status: string }>("/api/nodes/status", {
					method: "POST",
					body: JSON.stringify({ project_id: projectId, node_id: nodeId, status }),
				}),
	lock: (id: string) =>
		isLemmaHosted()
			? callApi<LockResult>("lock", { project_id: id })
			: req<LockResult>(`/api/projects/${id}/lock`, { method: "POST" }),
	unlock: (id: string) =>
		isLemmaHosted()
			? callApi<LockResult>("unlock", { project_id: id })
			: req<LockResult>(`/api/projects/${id}/unlock`, { method: "POST" }),
	exportRepo: (id: string) =>
		isLemmaHosted()
			? callApi<ExportResult>("export", { project_id: id, push: false })
			: req<ExportResult>(`/api/projects/${id}/export`, {
					method: "POST",
					body: JSON.stringify({ push: false }),
				}),
	digest: (id: string) =>
		isLemmaHosted()
			? callApi<DigestResult>("digest", { project_id: id })
			: req<DigestResult>(`/api/projects/${id}/digest`, { method: "POST" }),

	// ---- manual editing (persisted) ----
	createProject: (name: string, prompt?: string) =>
		isLemmaHosted()
			? callApi<{ project: Project }>("create_project", { name, prompt })
			: req<{ project: Project }>("/api/projects", {
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
		isLemmaHosted()
			? callApi<{ node: RFNode }>("create_node", { project_id: projectId, ...body })
			: req<{ node: RFNode }>(`/api/projects/${projectId}/nodes`, {
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
		isLemmaHosted()
			? callApi<{ node: RFNode }>("update_node", { project_id: projectId, slug, ...patch })
			: req<{ node: RFNode }>(`/api/projects/${projectId}/nodes/${slug}`, {
					method: "PATCH",
					body: JSON.stringify(patch),
				}),
	deleteNode: (projectId: string, slug: string) =>
		isLemmaHosted()
			? callApi<{ deleted: string; edges_removed: number; tasks_removed: number }>(
					"delete_node",
					{ project_id: projectId, slug },
				)
			: req<{ deleted: string; edges_removed: number; tasks_removed: number }>(
					`/api/projects/${projectId}/nodes/${slug}`,
					{ method: "DELETE" },
				),
	createEdge: (projectId: string, source: string, target: string) =>
		isLemmaHosted()
			? callApi<{ edge: RFEdge }>("create_edge", { project_id: projectId, source, target })
			: req<{ edge: RFEdge }>(`/api/projects/${projectId}/edges`, {
					method: "POST",
					body: JSON.stringify({ source, target }),
				}),
	deleteEdge: (projectId: string, edgeId: string) =>
		isLemmaHosted()
			? callApi<{ deleted: string }>("delete_edge", { project_id: projectId, edge_id: edgeId })
			: req<{ deleted: string }>(`/api/projects/${projectId}/edges/${edgeId}`, {
					method: "DELETE",
				}),
	relayout: (projectId: string) =>
		isLemmaHosted()
			? callApi<ProjectDetail>("relayout", { project_id: projectId })
			: req<ProjectDetail>(`/api/projects/${projectId}/relayout`, { method: "POST" }),
};
