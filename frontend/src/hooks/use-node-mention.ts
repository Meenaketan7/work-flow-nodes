import { useMemo } from "react";
import { useWorkFlowStore } from "@/hooks";

export interface Suggestion {
	id: string;
	name: string;
	nodeType: string;
}

export interface MentionState {
	open: boolean;
	query: string;
	triggerIndex: number;
}

export function useNodeMention(value: string, currentNodeId: string) {
	const nodes = useWorkFlowStore((s) => s.nodes);
	const mention: MentionState = useMemo(() => {
		const lastOpen = value.lastIndexOf("{{");
		if (lastOpen === -1) return { open: false, query: "", triggerIndex: -1 };

		const afterTrigger = value.slice(lastOpen + 2);
		// Already closed → not a live mention
		if (afterTrigger.includes("}}")) return { open: false, query: "", triggerIndex: -1 };

		return { open: true, query: afterTrigger.trim(), triggerIndex: lastOpen };
	}, [value]);

	const suggestions: Suggestion[] = useMemo(() => {
		if (!mention.open) return [];
		return nodes
			.filter((n) => n.id !== currentNodeId)
			.map((n) => ({
				id: n.id,
				name: (n.data?.nodeName as string) || n.id,
				nodeType: (n.data?.nodeType as string) ?? n.type ?? ""
			}))
			.filter(
				(n) => mention.query === "" || n.name.toLowerCase().includes(mention.query.toLowerCase())
			);
	}, [nodes, mention, currentNodeId]);

	return { mention, suggestions };
}
