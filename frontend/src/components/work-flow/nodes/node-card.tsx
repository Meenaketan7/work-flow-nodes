import { Card } from "@/components/ui/card";
import { NodeTypeConfig } from "@/constants";
import { cn } from "@/lib/utils";
import { Accents } from "./accents";

export function NodeCard({ node, classname }: { node: NodeTypeConfig; classname?: string }) {
	const { type, label, icon: Icon } = node;

	const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: string) => {
		const appData = { nodeType };
		event.dataTransfer.setData("application/reactflow", JSON.stringify(appData));
		event.dataTransfer.effectAllowed = "move";
	};

	return (
		<Card
			draggable
			onDragStart={(event) => onDragStart(event, type)}
			className={cn(
				"group/node relative flex h-24 w-full cursor-grab flex-col items-center justify-center gap-2 transition-all",
				"rounded-xs border border-border bg-card hover:border-primary hover:bg-primary/5 hover:shadow-md active:cursor-grabbing",
				classname
			)}
		>
			<Accents />
			<Icon
				className="h-6 w-6 text-foreground/80 transition-colors group-hover/node:text-primary"
				strokeWidth={1.5}
			/>
			<span className="text-xs font-medium text-foreground/90 transition-colors group-hover/node:text-primary">
				{label}
			</span>
		</Card>
	);
}
