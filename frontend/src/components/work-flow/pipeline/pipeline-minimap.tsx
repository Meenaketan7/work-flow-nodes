import { MiniMap } from "reactflow";

export function PipelineMinimap() {
	return (
		<MiniMap
			className="!absolute !right-6 !bottom-24 z-50 !m-0 overflow-hidden !rounded-xl !border !border-border !bg-card !shadow-sm"
			nodeColor={(node) => {
				switch (node.type) {
					case "customInput":
						return "#0D9488";
					case "llm":
						return "var(--primary)";
					case "customOutput":
						return "#F43F5E";
					default:
						return "var(--muted-foreground)";
				}
			}}
			nodeStrokeColor="var(--border)"
			nodeStrokeWidth={1}
			nodeBorderRadius={4}
			maskColor="color-mix(in srgb, var(--background) 80%, transparent)"
			maskStrokeColor="var(--primary)"
			maskStrokeWidth={2}
			pannable={true}
			zoomable={true}
		/>
	);
}
