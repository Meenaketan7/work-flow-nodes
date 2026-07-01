// Custom reactflow node for the Forge canvas — visually identical to the legacy
// pipeline's BaseNode (accent corners, tinted header with a layer icon, the blue
// "name tag" box, a separator, and the ringed source/target handle dots), but
// driven by the Forge data model ({ slug, title, summary, layer, kind, status }).
// The SAME component renders both AI-generated nodes and hand-dragged ones, so the
// whole board keeps one look.
//
// Two legacy node behaviours are restored here:
//   • rename — the title in the header is an inline input; edits persist via the
//     project's rename handler (the slug stays the immutable edge key).
//   • tagging — a "link a node" field lists the other nodes; picking one creates a
//     real edge (picked → this), exactly the old {{mention}} auto-edge behaviour.
// Both reach the project through ForgeNodeContext (provided by ForgeScreen) so the
// node stays presentational and reactflow `data` doesn't have to carry callbacks.
import { createContext, useContext, useState } from "react";
import { useCallback } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import type { NodeProps } from "reactflow";
import {
	Cloud,
	Database,
	Monitor,
	Plug,
	Server,
	X,
	type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Accents } from "@/components/work-flow/nodes/accents";
import { LAYER_META } from "@/constants/forge-node-library";
import type { ForgeLayer } from "@/constants/forge-node-library";
import type { ForgeNodeData } from "@/lib/forge-api";
import { cn } from "@/lib/utils";

// ---- context: lets a node reach the project's live handlers ----
export type ForgeNodeCtx = {
	// lite view of every node on the board (for the tag-link suggestions)
	nodes: { slug: string; title: string; layer: string }[];
	renameNode: (slug: string, title: string) => void; // optimistic, local
	commitRename: (slug: string, title: string) => void; // persist on blur
	connectNodes: (source: string, target: string) => void; // create a real edge
};
export const ForgeNodeContext = createContext<ForgeNodeCtx | null>(null);

// One representative icon per architecture layer (generated nodes are all
// kind="component", so the layer is the reliable signal).
const LAYER_ICON: Record<ForgeLayer, LucideIcon> = {
	client: Monitor,
	api: Server,
	data: Database,
	integration: Plug,
	infra: Cloud,
};

// Build-state colour coding (designed → building → blocked → done).
const DEFAULT_STATUS = { label: "Designed", color: "#94a3b8" };
const STATUS: Record<string, { label: string; color: string }> = {
	designed: DEFAULT_STATUS,
	building: { label: "Building", color: "#3b82f6" },
	blocked: { label: "Blocked", color: "#ef4444" },
	done: { label: "Done", color: "#22c55e" },
};

function layerOf(raw: string): ForgeLayer {
	return (raw as ForgeLayer) in LAYER_META ? (raw as ForgeLayer) : "api";
}

// Tag/mention field: type to filter the other nodes, pick one to create an edge
// (picked node → this node), mirroring the legacy {{nodeName}} auto-edge.
function TagLink({ selfSlug }: { selfSlug: string }) {
	const ctx = useContext(ForgeNodeContext);
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	if (!ctx) return null;

	const q = query.trim().toLowerCase();
	const suggestions = ctx.nodes
		.filter((n) => n.slug !== selfSlug)
		.filter(
			(n) =>
				q === "" ||
				n.slug.toLowerCase().includes(q) ||
				n.title.toLowerCase().includes(q),
		)
		.slice(0, 20);

	const pick = (slug: string) => {
		ctx.connectNodes(slug, selfSlug);
		setQuery("");
		setOpen(false);
	};

	return (
		<div className="relative px-3 pb-2.5">
			<Input
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setOpen(true);
				}}
				onFocus={() => setOpen(true)}
				onBlur={() => window.setTimeout(() => setOpen(false), 120)}
				placeholder="+ link a node…"
				className="nodrag nowheel h-7 rounded-xs bg-background text-xs placeholder:text-muted-foreground/70"
			/>
			{open && suggestions.length > 0 && (
				<Command
					shouldFilter={false}
					className="nodrag nowheel absolute top-full right-3 left-3 z-50 mt-1 h-auto w-auto overflow-hidden rounded-xs border border-border bg-popover shadow-xl"
				>
					<CommandList className="max-h-52 overflow-y-auto">
						<CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
							No nodes found.
						</CommandEmpty>
						<CommandGroup heading="Link into this node" className="rounded-xs">
							{suggestions.map((s) => (
								<CommandItem
									key={s.slug}
									value={s.slug}
									onMouseDown={(e) => e.preventDefault()}
									onSelect={() => pick(s.slug)}
									className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs"
								>
									<span
										className="h-2 w-2 shrink-0 rounded-full"
										style={{ backgroundColor: LAYER_META[layerOf(s.layer)].color }}
									/>
									<span className="truncate font-medium text-foreground">{s.title}</span>
									<span className="ml-auto truncate text-[10px] text-muted-foreground">
										{s.slug}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			)}
		</div>
	);
}

export function ForgeNode({ id, data, selected }: NodeProps<ForgeNodeData>) {
	const ctx = useContext(ForgeNodeContext);
	const { deleteElements } = useReactFlow();
	const onDelete = useCallback(
		() => deleteElements({ nodes: [{ id }] }),
		[id, deleteElements],
	);

	const layer = layerOf(data.layer);
	const accent = LAYER_META[layer].color;
	const Icon = LAYER_ICON[layer];
	const status = STATUS[data.status] ?? DEFAULT_STATUS;

	return (
		<Card
			className={cn(
				"relative w-56 overflow-visible rounded-xs border-border p-0 shadow-sm transition-shadow duration-150 hover:shadow-lg",
				selected && "ring-2 ring-ring",
			)}
		>
			<Accents selected={selected} />

			{/* tinted header: layer icon + editable title + summary + delete */}
			<div className="mx-3 mt-3 flex flex-row items-start justify-between gap-2 rounded-xs bg-primary/20 p-2">
				<div className="flex min-w-0 items-start gap-2">
					<span
						className="mt-0.5 flex-shrink-0 rounded-md p-1"
						style={{ color: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
					>
						<Icon size={14} strokeWidth={2.2} />
					</span>
					<div className="min-w-0">
						<input
							value={data.title}
							onChange={(e) => ctx?.renameNode(id, e.target.value)}
							onBlur={() => ctx?.commitRename(id, data.title)}
							onKeyDown={(e) => {
								if (e.key === "Enter") (e.target as HTMLInputElement).blur();
							}}
							title="Rename this node"
							spellCheck={false}
							className="nodrag w-full truncate bg-transparent text-sm leading-tight font-semibold text-foreground outline-none focus:rounded-xs focus:bg-background focus:px-1 focus:ring-1 focus:ring-primary/40"
						/>
						{data.summary && (
							<p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
								{data.summary}
							</p>
						)}
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon"
					onClick={onDelete}
					className="nodrag h-6 w-6 flex-shrink-0 text-muted-foreground"
				>
					<X size={12} strokeWidth={2.5} />
				</Button>
			</div>

			{/* slug "name tag" — the immutable connection id used as edge source/target */}
			<div className="px-3 pt-1 pb-2">
				<div
					className="truncate rounded-xs border border-primary/30 bg-primary/10 px-2 py-1 text-center text-sm font-semibold text-primary"
					title={data.slug}
				>
					{data.slug}
				</div>
			</div>

			<Separator />

			{/* tag system: pick a node to link it into this one (creates an edge) */}
			<TagLink selfSlug={id} />

			{/* build state + layer badges */}
			<div className="flex items-center justify-between gap-2 px-3 py-2">
				<span
					className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
					style={{ color: accent, backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)` }}
				>
					{LAYER_META[layer].label}
				</span>
				<span
					className="flex items-center gap-1 text-[10px] font-medium"
					style={{ color: status.color }}
				>
					<span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} />
					{status.label}
				</span>
			</div>

			{/* ringed handle dots — same look as the legacy HandleDot */}
			<Handle
				type="target"
				position={Position.Left}
				className="z-10 !-left-[7px] !h-3.5 !w-3.5 !border-[2.5px] !bg-background"
				style={{ top: "50%", borderColor: "var(--primary)" }}
			/>
			<Handle
				type="source"
				position={Position.Right}
				className="z-10 !-right-[7px] !h-3.5 !w-3.5 !border-[2.5px] !bg-background"
				style={{ top: "50%", borderColor: "var(--primary)" }}
			/>
		</Card>
	);
}
