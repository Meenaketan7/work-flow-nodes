// The center canvas: the live architecture board. Presentational — all state and
// persistence live in ForgeScreen. This wires ReactFlow: palette drop -> create
// node, hand-drawn connections -> create edge, drag -> persist position, and the
// edge styling that fixes the "which way does this point" problem (arrowheads +
// smoothstep + highlight the selected node's edges, dim the rest).
import { useCallback, useMemo, useRef, useState } from "react";
import ReactFlow, { MarkerType, MiniMap, Panel } from "reactflow";
import type {
	Connection,
	Edge,
	Node,
	NodeMouseHandler,
	OnEdgesChange,
	OnNodesChange,
	ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";

import { PipelineController } from "@/components/work-flow/pipeline/pipeline-controller";
import { PipelineCustomBackground } from "@/components/work-flow/pipeline/pipeline-custom-background";
import { LAYER_META } from "@/constants/forge-node-library";
import type { ForgeLayer } from "@/constants/forge-node-library";
import type { ForgeNodeData } from "@/lib/forge-api";

import { ForgeNode } from "./forge-node";

// Module-scoped so the reference is stable (React Flow warns otherwise).
const nodeTypes = { forge: ForgeNode };

const EDGE_BASE = {
	type: "smoothstep" as const,
	markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
};

export type ForgeCanvasProps = {
	nodes: Node<ForgeNodeData>[];
	edges: Edge[];
	selectedId: string | null;
	onNodesChange: OnNodesChange;
	onEdgesChange: OnEdgesChange;
	onConnect: (c: Connection) => void;
	onNodeClick: NodeMouseHandler;
	onPaneClick: () => void;
	onNodeDragStop: (event: React.MouseEvent, node: Node) => void;
	onNodesDelete: (nodes: Node[]) => void;
	onEdgesDelete: (edges: Edge[]) => void;
	onDropPalette: (paletteType: string, position: { x: number; y: number }) => void;
	onArrange?: () => void;
};

export function ForgeCanvas({
	nodes,
	edges,
	selectedId,
	onNodesChange,
	onEdgesChange,
	onConnect,
	onNodeClick,
	onPaneClick,
	onNodeDragStop,
	onNodesDelete,
	onEdgesDelete,
	onDropPalette,
	onArrange,
}: ForgeCanvasProps) {
	const wrapper = useRef<HTMLDivElement>(null);
	const [rf, setRf] = useState<ReactFlowInstance | null>(null);
	const [showMinimap, setShowMinimap] = useState(true);
	const [locked, setLocked] = useState(false);
	const [hovering, setHovering] = useState(false);

	// Radial cursor highlight (legacy PipelineContainer behaviour): track the mouse
	// as CSS vars so PipelineCustomBackground's highlight dots glow under the cursor.
	const onMouseMove = useCallback((e: React.MouseEvent) => {
		const el = wrapper.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		el.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
		el.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
	}, []);

	// Edge styling: highlight the selected node's edges, fade the rest. With
	// arrowheads + smoothstep this makes source -> target unambiguous.
	const styledEdges = useMemo<Edge[]>(() => {
		const anySelected = Boolean(selectedId);
		return edges.map((e) => {
			const connected = selectedId && (e.source === selectedId || e.target === selectedId);
			const color = connected ? "var(--primary)" : "var(--muted-foreground)";
			const dim = anySelected && !connected;
			return {
				...EDGE_BASE,
				...e,
				animated: Boolean(connected),
				style: {
					stroke: color,
					strokeWidth: connected ? 2.5 : 1.5,
					opacity: dim ? 0.18 : 0.9,
				},
				markerEnd: { ...EDGE_BASE.markerEnd, color },
			};
		});
	}, [edges, selectedId]);

	const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
	}, []);

	const onDrop = useCallback(
		(event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			if (!wrapper.current || !rf) return;
			const raw = event.dataTransfer.getData("application/reactflow");
			if (!raw) return;
			let paletteType = "";
			try {
				paletteType = JSON.parse(raw)?.paletteType ?? "";
			} catch {
				return;
			}
			if (!paletteType) return;
			const bounds = wrapper.current.getBoundingClientRect();
			const position = rf.project({
				x: event.clientX - bounds.left,
				y: event.clientY - bounds.top,
			});
			onDropPalette(paletteType, position);
		},
		[rf, onDropPalette],
	);

	return (
		<div
			ref={wrapper}
			className="relative h-full w-full overflow-hidden"
			onMouseMove={onMouseMove}
			onMouseEnter={() => setHovering(true)}
			onMouseLeave={() => setHovering(false)}
			style={{ "--mouse-opacity": hovering ? 1 : 0 } as React.CSSProperties}
		>
			<ReactFlow
				nodes={nodes}
				edges={styledEdges}
				nodeTypes={nodeTypes}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onNodeClick={onNodeClick}
				onPaneClick={onPaneClick}
				onNodeDragStop={onNodeDragStop}
				onNodesDelete={onNodesDelete}
				onEdgesDelete={onEdgesDelete}
				onInit={setRf}
				onDrop={onDrop}
				onDragOver={onDragOver}
				fitView
				fitViewOptions={{ padding: 0.25 }}
				nodesDraggable={!locked}
				nodesConnectable={!locked}
				elementsSelectable={!locked}
				proOptions={{ hideAttribution: true }}
			>
				<PipelineCustomBackground />
				<PipelineController
					onToggleMinimap={() => setShowMinimap((v) => !v)}
					onToggleLock={setLocked}
					onArrange={onArrange}
				/>
				{showMinimap && (
					<MiniMap
						className="!absolute !right-6 !bottom-24 z-50 !m-0 overflow-hidden !rounded-xl !border !border-border !bg-card !shadow-sm"
						nodeColor={(n) => LAYER_META[(n.data?.layer as ForgeLayer) ?? "api"]?.color ?? "#64748b"}
						nodeStrokeWidth={2}
						nodeBorderRadius={4}
						maskColor="color-mix(in srgb, var(--background) 80%, transparent)"
						pannable
						zoomable
					/>
				)}
				<Panel position="top-left">
					<div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-1.5 text-[11px] shadow-sm backdrop-blur">
						{(Object.keys(LAYER_META) as ForgeLayer[]).map((l) => (
							<span key={l} className="flex items-center gap-1 text-muted-foreground">
								<span
									className="h-2 w-2 rounded-full"
									style={{ backgroundColor: LAYER_META[l].color }}
								/>
								{LAYER_META[l].label}
							</span>
						))}
					</div>
				</Panel>
			</ReactFlow>
			{nodes.length === 0 && (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<p className="max-w-sm text-center text-sm text-muted-foreground">
						Drag nodes from the left, or open the <strong>Assistant</strong> (top
						right) and describe your idea — Forge will design the system map +
						backlog here.
					</p>
				</div>
			)}
		</div>
	);
}
