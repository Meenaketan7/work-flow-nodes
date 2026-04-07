import { Button } from "./button";
import { ModeToggle } from "./mode-toggle";
import { Separator } from "./separator";
import { NodeLibraryTrigger } from "./node-library-trigger";
import { useWorkFlowStore } from "@/hooks";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function SiteHeader() {
	const { clearPipeline } = useWorkFlowStore();
	const onSubmit = useWorkFlowStore((s) => s.onSubmit);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const handleSubmit = async () => {
		try {
			const result = await onSubmit();

			toast.success("Pipeline Parsed Successfully!", {
				description: `Nodes: ${result.num_nodes} • Edges: ${result.num_edges} • Is DAG: ${result.is_dag}`,
				duration: 4000
			});
		} catch (error) {
			toast.error("Submission Failed", {
				description: "Could not connect to the backend server.",
				duration: 4000
			});
		} finally {
			setIsSubmitting(false);
		}
	};
	return (
		<header className="flex h-[var(--header-height,3.5rem)] shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<NodeLibraryTrigger className="-ml-1" />{" "}
				<Separator orientation="vertical" className="mx-2" />
				<h1 className="text-base font-medium">Workflow</h1>
				<div className="ml-auto flex items-center gap-2">
					<ModeToggle />
					<Button variant={"outline"} onClick={clearPipeline}>
						Reset
					</Button>
					<Button onClick={handleSubmit} disabled={isSubmitting}>
						{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						{isSubmitting ? "Submitting..." : "Submit"}
					</Button>{" "}
				</div>
			</div>
		</header>
	);
}
