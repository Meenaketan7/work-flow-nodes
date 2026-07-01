// Left sidebar: the architecture node library. A shadcn collapsible Sidebar (so
// the header's Node Library button can slide it in/out — same as the legacy
// AppSidebar), rendering the same look as the legacy pipeline's Node Library:
// category headings + a dashed 2-col grid of draggable cards, each with the
// corner Accents brackets. Dragging a card onto the canvas persists a real node
// in the current project (handled by the canvas onDrop).
import * as React from "react";
import { WorkflowIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Sidebar, SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { Accents } from "@/components/work-flow/nodes/accents";
import {
	FORGE_PALETTE,
	LAYER_META,
	PALETTE_CATEGORIES,
} from "@/constants/forge-node-library";
import type { ForgePaletteNode } from "@/constants/forge-node-library";
import { cn } from "@/lib/utils";

function PaletteCard({ node }: { node: ForgePaletteNode }) {
	const { label, icon: Icon, type, layer } = node;
	const color = LAYER_META[layer].color;
	const onDragStart = (event: React.DragEvent<HTMLDivElement>) => {
		event.dataTransfer.setData("application/reactflow", JSON.stringify({ paletteType: type }));
		event.dataTransfer.effectAllowed = "move";
	};
	return (
		<Card
			draggable
			onDragStart={onDragStart}
			title={node.defaultSummary}
			className={cn(
				"group/node relative flex h-24 w-full cursor-grab flex-col items-center justify-center gap-2 transition-all",
				"rounded-xs border-0 bg-transparent shadow-none hover:bg-primary/5 hover:shadow-sm active:cursor-grabbing",
			)}
		>
			<Accents />
			<Icon className="h-6 w-6 transition-colors" style={{ color }} strokeWidth={1.5} />
			<span className="text-xs font-medium text-foreground/90 transition-colors group-hover/node:text-primary">
				{label}
			</span>
		</Card>
	);
}

export function ForgePalette(props: React.ComponentProps<typeof Sidebar>) {
	const grouped = PALETTE_CATEGORIES.map((category) => ({
		category,
		nodes: FORGE_PALETTE.filter((n) => n.category === category),
	})).filter((g) => g.nodes.length > 0);

	return (
		<Sidebar collapsible="offcanvas" variant="inset" {...props}>
			<SidebarHeader className="border-b border-border bg-card pb-4">
				<span className="flex items-center gap-3 px-2 pt-1 font-semibold tracking-tight">
					<WorkflowIcon className="h-5 w-5" />
					Node Library
				</span>
			</SidebarHeader>

			<SidebarContent className="px-6 pt-6">
				{grouped.map(({ category, nodes }) => (
					<div key={category} className="mb-10">
						<h3 className="mb-4 px-1 text-xs font-bold tracking-wider text-muted-foreground/80 uppercase">
							{category}
						</h3>
						<div className="relative">
							<div className="pointer-events-none absolute top-0 -right-3 -left-3 border-t border-dashed border-border/70" />
							<div className="pointer-events-none absolute -right-3 bottom-0 -left-3 border-t border-dashed border-border/70" />
							<div className="pointer-events-none absolute -top-3 -bottom-3 left-0 border-l border-dashed border-border/70" />
							<div className="pointer-events-none absolute -top-3 right-0 -bottom-3 border-l border-dashed border-border/70" />
							<div className="grid grid-cols-2">
								{nodes.map((node, i) => {
									const isLeftColumn = i % 2 === 0;
									const isLastRow = i >= Math.floor((nodes.length - 1) / 2) * 2;
									return (
										<div
											key={node.type}
											className={cn(
												"border-dashed border-border/70 p-2",
												isLeftColumn && "border-r",
												!isLastRow && "border-b",
											)}
										>
											<PaletteCard node={node} />
										</div>
									);
								})}
							</div>
						</div>
					</div>
				))}
				<p className="px-1 pb-6 text-[11px] leading-relaxed text-muted-foreground/70">
					Drag a node onto the canvas to add it, then connect handles to define
					dependencies. Or describe your idea in the assistant to auto-generate the
					whole map.
				</p>
			</SidebarContent>
		</Sidebar>
	);
}
