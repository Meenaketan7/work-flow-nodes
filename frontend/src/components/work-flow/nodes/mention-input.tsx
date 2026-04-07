import { FieldConfig } from "../types";
import { useWorkFlowStore } from "@/hooks";
import { Suggestion, useNodeMention } from "@/hooks/use-node-mention";
import { useCallback } from "react";
import { NODE_LIBRARY } from "@/constants";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList
} from "@/components/ui/command";

function MentionDropdown({
	suggestions,
	onSelect
}: {
	suggestions: Suggestion[];
	onSelect: (s: Suggestion) => void;
}) {
	if (suggestions.length === 0) return null;

	return (
		<Command
			shouldFilter={false}
			className="nodrag nowheel absolute top-full left-0 z-50 mt-1 h-auto w-full overflow-hidden rounded-xs border border-border bg-popover shadow-xl"
		>
			<CommandList className="max-h-60 overflow-y-auto">
				<CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
					No nodes found.
				</CommandEmpty>
				<CommandGroup heading="Select Node" className="rounded-xs">
					{suggestions.map((s) => {
						const libEntry = NODE_LIBRARY.find((n) => n.type === s.nodeType);
						const Icon = libEntry?.icon;

						return (
							<CommandItem
								key={s.id}
								value={s.name}
								onSelect={() => onSelect(s)}
								onMouseDown={(e) => e.preventDefault()}
								className="flex h-auto cursor-pointer items-start justify-between px-2.5 py-2 text-xs"
							>
								<div className="flex items-start gap-2 pr-2">
									{Icon && <Icon size={14} className="mt-0.5 shrink-0 text-primary" />}

									<span className="font-medium break-all whitespace-normal text-foreground">
										{s.name}
									</span>
								</div>
							</CommandItem>
						);
					})}
				</CommandGroup>
			</CommandList>
		</Command>
	);
}
export function MentionInput({
	nodeId,
	field,
	value,
	onChange,
	multiline = false
}: {
	nodeId: string;
	field: FieldConfig;
	value: string;
	onChange: (val: string) => void;
	multiline?: boolean;
}) {
	const edges = useWorkFlowStore((s) => s.edges);
	const addAutoEdge = useWorkFlowStore((s) => s.addAutoEdge);
	const { mention, suggestions } = useNodeMention(value, nodeId);
	const handleSelect = useCallback(
		(selected: Suggestion) => {
			if (mention.triggerIndex === -1) return;
			//Complete the {{nodeName}} text immediately
			const rawAfterTrigger = value.slice(mention.triggerIndex + 2);
			const before = value.slice(0, mention.triggerIndex);
			const after = value.slice(mention.triggerIndex + 2 + rawAfterTrigger.length);
			onChange(before + `{{${selected.name}}}` + after);

			//find the course hanlde
			const libEntry = NODE_LIBRARY.find((n) => n.type === selected.nodeType);
			const sourceHandleId = libEntry?.handles?.outputs?.[0]?.id ?? "value";
			addAutoEdge({
				id: `e-${selected.id}-${nodeId}-${selected.name}`,
				source: selected.id,
				sourceHandle: `${selected.id}-${sourceHandleId}`,
				target: nodeId,
				targetHandle: `${nodeId}-${selected.name}`
			} as any);
		},
		[value, edges, mention, onChange, nodeId, addAutoEdge]
	);
	const sharedClass = "nodrag nowheel bg-background rounded-xs";
	return (
		<div className="relative">
			{multiline ? (
				<Textarea
					value={value}
					placeholder={field.placeholder}
					onChange={(e) => onChange(e.target.value)}
					className={cn(sharedClass, "min-h-[80px] resize-y")}
				/>
			) : (
				<Input
					type="text"
					value={value}
					placeholder={field.placeholder}
					onChange={(e) => onChange(e.target.value)}
					className={cn(
						sharedClass,
						field.key.includes("Name") && "border-primary/20 bg-primary/5 text-center font-medium"
					)}
				/>
			)}
			{mention.open && <MentionDropdown suggestions={suggestions} onSelect={handleSelect} />}
		</div>
	);
}
