import * as React from "react";
import { Sidebar, SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { NODE_LIBRARY } from "@/constants";
import { NodeCard } from "../work-flow";
import { WorkflowIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
	const groupedNodes = NODE_LIBRARY.reduce(
		(acc, node) => {
			const category = node.category || "Uncategorized";
			if (!acc[category]) acc[category] = [];
			acc[category].push(node);
			return acc;
		},
		{} as Record<string, typeof NODE_LIBRARY>
	);

	return (
		<Sidebar collapsible="offcanvas" {...props}>
			<SidebarHeader className="border-b border-border bg-card pb-4">
				<span className="flex gap-3 px-2 font-semibold tracking-tight">
					<WorkflowIcon />
					Node Library
				</span>
			</SidebarHeader>

			<SidebarContent className="px-6 pt-6">
				{Object.entries(groupedNodes).map(([category, nodes]) => (
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
												!isLastRow && "border-b"
											)}
										>
											<NodeCard
												node={node}
												classname="border-0 bg-transparent shadow-none hover:bg-primary/5 hover:shadow-sm"
											/>
										</div>
									);
								})}
							</div>
						</div>
					</div>
				))}
			</SidebarContent>
		</Sidebar>
	);
}
