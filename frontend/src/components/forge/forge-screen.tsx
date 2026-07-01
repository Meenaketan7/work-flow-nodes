// Forge — the unified screen, restored to the legacy pipeline's shadcn
// "sidebar-inset" shape: a collapsible Node Library sidebar on the left, an inset
// card holding the header + reactflow board, and (new) a right-hand Sheet drawer
// for the build assistant (describe-to-generate + project actions + node
// guidance), toggled from the header. This component owns all state + persistence;
// ForgeCanvas / ForgePalette / ForgeNode stay presentational.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider, useEdgesState, useNodesState } from "reactflow";
import type { Connection, Edge, Node, NodeMouseHandler } from "reactflow";
import { Loader2, MessageSquareText, Plus, Sparkles, Square, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { NodeLibraryTrigger } from "@/components/ui/node-library-trigger";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { FORGE_PALETTE } from "@/constants/forge-node-library";
import type {
	DigestResult,
	ExportResult,
	ForgeNodeData,
	Guidance,
	Project,
} from "@/lib/forge-api";
import { forgeApi } from "@/lib/forge-api";

import { ForgeCanvas } from "./forge-canvas";
import { ForgeNodeContext } from "./forge-node";
import type { ForgeNodeCtx } from "./forge-node";
import { ForgePalette } from "./forge-palette";

const STATUSES = ["designed", "building", "blocked", "done"] as const;

// Generation is a multi-minute, multi-stage pipeline — these label the streamed
// stages so the user always sees what's happening.
const GEN_STEPS = ["grounding", "decompose", "refine", "persisting"] as const;
const STAGE_LABEL: Record<string, string> = {
	grounding: "Grounding in your knowledge base…",
	grounded: "Knowledge loaded",
	decompose: "Decomposing into components…",
	decomposed: "Drafted the system map",
	refine: "Refining & generating the backlog…",
	persisting: "Saving your architecture…",
	done: "Done",
};
const STAGE_STEP: Record<string, number> = {
	grounding: 0,
	grounded: 0,
	decompose: 1,
	decomposed: 1,
	refine: 2,
	persisting: 3,
	done: 4,
};

type Progress = { stage: string; label: string; step: number; detail: string };

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="rounded-lg border bg-card p-3">
			<h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				{title}
			</h3>
			{children}
		</section>
	);
}

function Md({ text }: { text: string }) {
	return (
		<pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
			{text}
		</pre>
	);
}

function ForgeScreenInner() {
	const [prompt, setPrompt] = useState("");
	const [projects, setProjects] = useState<Project[]>([]);
	const [project, setProject] = useState<Project | null>(null);
	const [nodes, setNodes, onNodesChange] = useNodesState<ForgeNodeData>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState([]);

	const [selected, setSelected] = useState<string | null>(null);
	const [guidance, setGuidance] = useState<Guidance | null>(null);
	const [guiding, setGuiding] = useState(false);
	const [output, setOutput] = useState<{ kind: string; text: string } | null>(null);

	const [generating, setGenerating] = useState(false);
	const [progress, setProgress] = useState<Progress | null>(null);
	const genAbort = useRef<AbortController | null>(null);
	const [busy, setBusy] = useState(false);
	const [chatOpen, setChatOpen] = useState(false);

	const refreshProjects = useCallback(async () => {
		try {
			setProjects((await forgeApi.listProjects()).projects);
		} catch (err) {
			console.warn("listProjects failed", err);
		}
	}, []);

	useEffect(() => {
		void refreshProjects();
	}, [refreshProjects]);

	const loadProject = useCallback(
		async (id: string) => {
			try {
				const res = await forgeApi.getProject(id);
				setProject(res.project);
				setNodes(res.graph.nodes as Node<ForgeNodeData>[]);
				setEdges(res.graph.edges as Edge[]);
				setSelected(null);
				setGuidance(null);
				setOutput(null);
			} catch (err) {
				toast.error(`Load failed: ${(err as Error).message}`);
			}
		},
		[setNodes, setEdges],
	);

	// ---- input: generate or start blank ----
	const onGenerate = useCallback(async () => {
		const idea = prompt.trim();
		if (!idea) {
			toast.warning("Describe your product idea first");
			return;
		}
		const controller = new AbortController();
		genAbort.current = controller;
		setGenerating(true);
		setProgress({
			stage: "grounding",
			label: STAGE_LABEL.grounding ?? "Starting…",
			step: 0,
			detail: "",
		});
		try {
			const done = await forgeApi.generateStream(idea, {
				signal: controller.signal,
				onProgress: (ev) => {
					let detail = "";
					if (ev.stage === "grounded") detail = `${ev.chars} chars`;
					if (ev.stage === "decomposed") detail = `${ev.nodes} components`;
					if (ev.stage === "persisting")
						detail = `${ev.nodes} nodes · ${ev.tasks} tasks`;
					setProgress({
						stage: ev.stage,
						label: STAGE_LABEL[ev.stage] ?? ev.stage,
						step: STAGE_STEP[ev.stage] ?? 0,
						detail,
					});
				},
			});
			toast.success(
				`Built ${done.counts.nodes} nodes, ${done.counts.edges} edges, ${done.counts.tasks} tasks`,
			);
			await refreshProjects();
			await loadProject(done.project_id);
			setPrompt("");
			setChatOpen(false); // reveal the freshly-built board
		} catch (err) {
			if ((err as Error).name === "AbortError") {
				toast.info("Generation stopped");
			} else {
				toast.error(`Generate failed: ${(err as Error).message}`);
			}
		} finally {
			setGenerating(false);
			setProgress(null);
			genAbort.current = null;
		}
	}, [prompt, loadProject, refreshProjects]);

	const onStopGenerate = useCallback(() => {
		genAbort.current?.abort();
	}, []);

	const onNewProject = useCallback(async () => {
		const name = window.prompt("Name this project", "New project");
		if (!name) return;
		try {
			const { project: p } = await forgeApi.createProject(name);
			await refreshProjects();
			await loadProject(p.id);
			toast.success("Blank project — drag nodes from the left to build");
		} catch (err) {
			toast.error(`Create failed: ${(err as Error).message}`);
		}
	}, [loadProject, refreshProjects]);

	// ---- manual editing (persisted) ----
	const onDropPalette = useCallback(
		async (paletteType: string, position: { x: number; y: number }) => {
			if (!project) {
				toast.warning("Pick or create a project first");
				return;
			}
			const def = FORGE_PALETTE.find((n) => n.type === paletteType);
			if (!def) return;
			try {
				const { node } = await forgeApi.createNode(project.id, {
					layer: def.layer,
					kind: def.type,
					title: def.defaultTitle,
					summary: def.defaultSummary,
					pos_x: position.x,
					pos_y: position.y,
				});
				setNodes((ns) => [...ns, node as Node<ForgeNodeData>]);
				toast.success(`Added ${def.defaultTitle}`);
			} catch (err) {
				toast.error(`Add failed: ${(err as Error).message}`);
			}
		},
		[project, setNodes],
	);

	// Create a real edge (source → target). Shared by hand-drawn connections and
	// the node's "link a node" tag field; rejects cycles server-side.
	const connectNodes = useCallback(
		async (source: string, target: string, silent = false) => {
			if (!project || !source || !target || source === target) return;
			try {
				const { edge } = await forgeApi.createEdge(project.id, source, target);
				setEdges((es) => {
					if (es.some((e) => e.source === source && e.target === target)) return es;
					return [...es, edge as Edge];
				});
				if (!silent) toast.success(`Linked ${source} → ${target}`);
			} catch (err) {
				toast.error((err as Error).message); // e.g. "that connection would create a cycle"
			}
		},
		[project, setEdges],
	);

	const onConnect = useCallback(
		(c: Connection) => {
			if (!c.source || !c.target) return;
			void connectNodes(c.source, c.target, true);
		},
		[connectNodes],
	);

	// ---- rename (legacy node behaviour): optimistic locally, persist on blur ----
	const renameNode = useCallback(
		(slug: string, title: string) => {
			setNodes((ns) =>
				ns.map((n) => (n.id === slug ? { ...n, data: { ...n.data, title } } : n)),
			);
		},
		[setNodes],
	);

	const commitRename = useCallback(
		(slug: string, title: string) => {
			if (!project) return;
			forgeApi.updateNode(project.id, slug, { title: title.trim() || slug }).catch(() => {
				/* rename persistence is best-effort */
			});
		},
		[project],
	);

	const onNodeDragStop = useCallback(
		(_e: React.MouseEvent, node: Node) => {
			if (!project) return;
			forgeApi
				.updateNode(project.id, node.id, { pos_x: node.position.x, pos_y: node.position.y })
				.catch(() => {
					/* position persistence is best-effort */
				});
		},
		[project],
	);

	const onNodesDelete = useCallback(
		(deleted: Node[]) => {
			if (!project) return;
			deleted.forEach((n) =>
				forgeApi
					.deleteNode(project.id, n.id)
					.catch((err) => toast.error(`Delete failed: ${(err as Error).message}`)),
			);
			if (selected && deleted.some((n) => n.id === selected)) {
				setSelected(null);
				setGuidance(null);
			}
		},
		[project, selected],
	);

	const onEdgesDelete = useCallback(
		(deleted: Edge[]) => {
			if (!project) return;
			// may already be gone if a node delete cascaded it — swallow not-found
			deleted.forEach((e) => forgeApi.deleteEdge(project.id, e.id).catch(() => {}));
		},
		[project],
	);

	// ---- action: per-node guidance + status ----
	const onNodeClick = useCallback<NodeMouseHandler>(
		(_evt, node) => {
			if (!project) return;
			setSelected(node.id);
			setGuidance(null);
			setGuiding(true);
			forgeApi
				.guidance(project.id, node.id)
				.then(setGuidance)
				.catch((err) => toast.error(`Guidance failed: ${(err as Error).message}`))
				.finally(() => setGuiding(false));
		},
		[project],
	);

	const setNodeStatus = useCallback(
		async (slug: string, status: string) => {
			if (!project) return;
			try {
				await forgeApi.setStatus(project.id, slug, status);
				setNodes((ns) =>
					ns.map((n) => (n.id === slug ? { ...n, data: { ...n.data, status } } : n)),
				);
				toast.success(`${slug} → ${status}`);
			} catch (err) {
				toast.error(`Status update failed: ${(err as Error).message}`);
			}
		},
		[project, setNodes],
	);

	// ---- approval + outcomes ----
	const onTidy = useCallback(async () => {
		if (!project) return;
		setBusy(true);
		try {
			const res = await forgeApi.relayout(project.id);
			setNodes(res.graph.nodes as Node<ForgeNodeData>[]);
			setEdges(res.graph.edges as Edge[]);
			toast.success("Layout tidied");
		} catch (err) {
			toast.error(`Tidy failed: ${(err as Error).message}`);
		} finally {
			setBusy(false);
		}
	}, [project, setNodes, setEdges]);

	const onLock = useCallback(async () => {
		if (!project) return;
		setBusy(true);
		try {
			const res = await forgeApi.lock(project.id);
			toast.success(
				res.already_locked
					? "Design already locked"
					: `Design locked — ${res.nodes_moved_to_building ?? 0} nodes → building`,
			);
			await loadProject(project.id);
		} catch (err) {
			toast.error(`Lock failed: ${(err as Error).message}`);
		} finally {
			setBusy(false);
		}
	}, [project, loadProject]);

	const onUnlock = useCallback(async () => {
		if (!project) return;
		setBusy(true);
		try {
			await forgeApi.unlock(project.id);
			toast.success("Design unlocked");
			await loadProject(project.id);
		} catch (err) {
			toast.error(`Unlock failed: ${(err as Error).message}`);
		} finally {
			setBusy(false);
		}
	}, [project, loadProject]);

	const onExport = useCallback(async () => {
		if (!project) return;
		setBusy(true);
		try {
			const res: ExportResult = await forgeApi.exportRepo(project.id);
			const text = res.pushed
				? `Pushed to ${res.repo_url}`
				: `Scaffold (dry-run, ${res.file_count} files):\n` +
					(res.files ?? []).map((f) => `  • ${f}`).join("\n");
			setOutput({ kind: "Repo export", text });
			toast.success("Scaffold ready");
		} catch (err) {
			toast.error(`Export failed: ${(err as Error).message}`);
		} finally {
			setBusy(false);
		}
	}, [project]);

	const onDigest = useCallback(async () => {
		if (!project) return;
		setBusy(true);
		try {
			const res: DigestResult = await forgeApi.digest(project.id);
			setOutput({ kind: "Build digest", text: res.digest_md });
			toast.success("Digest ready");
		} catch (err) {
			toast.error(`Digest failed: ${(err as Error).message}`);
		} finally {
			setBusy(false);
		}
	}, [project]);

	const selectedNode = nodes.find((n) => n.id === selected) ?? null;

	// context that lets each node rename itself + tag-link to others
	const nodeCtx = useMemo<ForgeNodeCtx>(
		() => ({
			nodes: nodes.map((n) => ({
				slug: n.id,
				title: n.data.title,
				layer: n.data.layer,
			})),
			renameNode,
			commitRename,
			connectNodes: (s, t) => void connectNodes(s, t),
		}),
		[nodes, renameNode, commitRename, connectNodes],
	);

	return (
		<SidebarProvider
			style={
				{
					"--sidebar-width": "18rem",
					"--header-height": "3.5rem",
					"--sidebar": "var(--card)",
					"--sidebar-border": "transparent",
				} as React.CSSProperties
			}
		>
			{/* left: collapsible node library */}
			<ForgePalette />

			{/* the inset "workspace card": header on top, canvas below */}
			<SidebarInset className="flex flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
				<header className="flex h-[var(--header-height,3.5rem)] shrink-0 items-center gap-2 border-b bg-background px-4 lg:px-6">
					<NodeLibraryTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mx-1 !h-6" />
					<h1 className="text-base font-medium">Forge</h1>
					<span className="hidden text-xs text-muted-foreground sm:inline">
						AI Build Operator
					</span>
					<Separator orientation="vertical" className="mx-1 !h-6" />
					<select
						value={project?.id ?? ""}
						onChange={(e) => e.target.value && void loadProject(e.target.value)}
						className="h-9 max-w-[16rem] rounded-md border bg-card px-2 text-sm"
					>
						<option value="">Open project…</option>
						{projects.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
								{p.design_locked ? " 🔒" : ""}
							</option>
						))}
					</select>
					<button
						onClick={() => void onNewProject()}
						className="flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-muted"
					>
						<Plus className="h-4 w-4" /> New
					</button>
					<button
						onClick={() => void onTidy()}
						disabled={!project || busy}
						title="Re-tidy the layout to de-tangle edges"
						className="flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
					>
						<Wand2 className="h-4 w-4" /> Tidy
					</button>
					<div className="ml-auto flex items-center gap-2">
						<ModeToggle />
						<Button
							variant={chatOpen ? "default" : "outline"}
							onClick={() => setChatOpen((o) => !o)}
							className="gap-1.5"
						>
							<MessageSquareText className="h-4 w-4" />
							<span className="hidden sm:inline">Assistant</span>
						</Button>
					</div>
				</header>

				<main className="relative flex-1 overflow-hidden">
					<ForgeNodeContext.Provider value={nodeCtx}>
						<ForgeCanvas
							nodes={nodes}
							edges={edges}
							selectedId={selected}
							onNodesChange={onNodesChange}
							onEdgesChange={onEdgesChange}
							onConnect={onConnect}
							onNodeClick={onNodeClick}
							onPaneClick={() => setSelected(null)}
							onNodeDragStop={onNodeDragStop}
							onNodesDelete={onNodesDelete}
							onEdgesDelete={onEdgesDelete}
							onDropPalette={onDropPalette}
							onArrange={project ? () => void onTidy() : undefined}
						/>
					</ForgeNodeContext.Provider>
					{generating && progress && (
						<div className="absolute inset-0 z-20 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
							<div className="w-80 rounded-xl border bg-card/95 p-5 shadow-xl">
								<div className="flex items-center gap-2">
									<Loader2 className="h-5 w-5 animate-spin text-primary" />
									<span className="text-sm font-semibold">Designing your architecture</span>
								</div>
								<p className="mt-2 text-sm text-muted-foreground">
									{progress.label}
									{progress.detail ? ` (${progress.detail})` : ""}
								</p>
								<div className="mt-3 flex gap-1.5">
									{GEN_STEPS.map((s, i) => (
										<div
											key={s}
											className={`h-1.5 flex-1 rounded-full transition-colors ${
												i <= progress.step ? "bg-primary" : "bg-muted"
											}`}
										/>
									))}
								</div>
								<p className="mt-2 text-[11px] text-muted-foreground">
									Designing the system map from your idea — this can take a moment.
								</p>
								<button
									onClick={onStopGenerate}
									className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-destructive/10 hover:text-destructive"
								>
									<Square className="h-3.5 w-3.5" /> Stop
								</button>
							</div>
						</div>
					)}
				</main>
			</SidebarInset>

			{/* right: the build assistant, a shadcn Sheet drawer toggled from the header */}
			<Sheet open={chatOpen} onOpenChange={setChatOpen} modal={false}>
				<SheetContent
					side="right"
					className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
				>
					<SheetHeader className="border-b p-4">
						<SheetTitle className="flex items-center gap-2">
							<Sparkles className="h-4 w-4 text-primary" /> Build Assistant
						</SheetTitle>
						<SheetDescription>
							Describe an idea to generate an architecture, or manage the current project.
						</SheetDescription>
					</SheetHeader>

					<div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
						{!project && (
							<p className="text-sm text-muted-foreground">
								Open a project from the header dropdown, hit <strong>New</strong> to
								start blank, or describe an idea below to generate one.
							</p>
						)}

						{project && (
							<Panel title="Project">
								<div className="flex items-center justify-between gap-2">
									<span className="text-sm font-semibold">{project.name}</span>
									<span
										className={`rounded px-2 py-0.5 text-[10px] font-medium ${
											project.design_locked
												? "bg-green-500/15 text-green-600"
												: "bg-muted text-muted-foreground"
										}`}
									>
										{project.design_locked ? "Design locked" : "Draft"}
									</span>
								</div>
								<div className="mt-1 text-[11px] text-muted-foreground">
									{nodes.length} nodes · {edges.length} edges
								</div>
								<div className="mt-3 flex flex-wrap gap-2">
									{project.design_locked ? (
										<button
											onClick={() => void onUnlock()}
											disabled={busy}
											className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
										>
											Unlock
										</button>
									) : (
										<button
											onClick={() => void onLock()}
											disabled={busy}
											className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
										>
											Approve &amp; lock design
										</button>
									)}
									<button
										onClick={() => void onExport()}
										disabled={busy}
										className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
									>
										Export scaffold
									</button>
									<button
										onClick={() => void onDigest()}
										disabled={busy}
										className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
									>
										Build digest
									</button>
								</div>
							</Panel>
						)}

						{output && (
							<Panel title={output.kind}>
								<Md text={output.text} />
							</Panel>
						)}

						{selectedNode && (
							<Panel title="Node">
								<div className="flex items-start justify-between gap-2">
									<div>
										<div className="text-sm font-semibold">{selectedNode.data.title}</div>
										<div className="mt-0.5 text-xs text-muted-foreground">
											{selectedNode.data.layer} · {selectedNode.data.status}
										</div>
									</div>
									<button
										onClick={() => {
											setNodes((ns) => ns.filter((n) => n.id !== selectedNode.id));
											setEdges((es) =>
												es.filter(
													(e) =>
														e.source !== selectedNode.id && e.target !== selectedNode.id,
												),
											);
											onNodesDelete([selectedNode]);
										}}
										title="Delete node"
										className="rounded-md border p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>
								<div className="mt-3 flex flex-wrap gap-1.5">
									{STATUSES.map((s) => (
										<button
											key={s}
											onClick={() => void setNodeStatus(selectedNode.id, s)}
											className={`rounded-md border px-2 py-1 text-[11px] capitalize ${
												selectedNode.data.status === s
													? "bg-primary text-primary-foreground"
													: "hover:bg-muted"
											}`}
										>
											{s}
										</button>
									))}
								</div>
							</Panel>
						)}

						{selectedNode && (
							<Panel title={guidance?.cached ? "Guidance (cached)" : "Guidance"}>
								{guiding && <p className="text-sm text-muted-foreground">Thinking…</p>}
								{!guiding && guidance && (
									<div className="space-y-3">
										<Md text={guidance.guidance_md} />
										{guidance.structured?.checklist?.length ? (
											<div>
												<div className="text-xs font-semibold text-muted-foreground">
													Done when
												</div>
												<ul className="ml-4 list-disc text-sm">
													{guidance.structured.checklist.map((c, i) => (
														<li key={i}>{c}</li>
													))}
												</ul>
											</div>
										) : null}
										{guidance.sources.length ? (
											<div className="text-[11px] text-muted-foreground">
												Sources: {guidance.sources.join(", ")}
											</div>
										) : null}
									</div>
								)}
								{!guiding && !guidance && (
									<p className="text-sm text-muted-foreground">
										Click a node for grounded build guidance.
									</p>
								)}
							</Panel>
						)}
					</div>

					{/* build description — pinned bottom */}
					<div className="shrink-0 border-t bg-card p-4">
						<label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							<Sparkles className="h-3.5 w-3.5" /> Describe what to build
						</label>
						<textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void onGenerate();
							}}
							rows={3}
							placeholder="e.g. a shared to-do app with login, lists, and reminders"
							className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
						/>
						{generating ? (
							<div className="mt-2 space-y-2">
								<div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
									<Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
									<div className="min-w-0">
										<div className="truncate text-xs font-medium">
											{progress?.label ?? "Designing…"}
										</div>
										{progress?.detail && (
											<div className="text-[10px] text-muted-foreground">
												{progress.detail}
											</div>
										)}
									</div>
								</div>
								<button
									onClick={onStopGenerate}
									className="flex h-9 w-full items-center justify-center gap-2 rounded-md border text-sm font-medium hover:bg-destructive/10 hover:text-destructive"
								>
									<Square className="h-4 w-4" /> Stop
								</button>
							</div>
						) : (
							<>
								<button
									onClick={() => void onGenerate()}
									className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground"
								>
									<Sparkles className="h-4 w-4" /> Design build
								</button>
								<p className="mt-1 text-center text-[10px] text-muted-foreground">
									⌘/Ctrl + Enter
								</p>
							</>
						)}
					</div>
				</SheetContent>
			</Sheet>
		</SidebarProvider>
	);
}

export function ForgeScreen() {
	return (
		<ReactFlowProvider>
			<ForgeScreenInner />
		</ReactFlowProvider>
	);
}
