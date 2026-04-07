import { Blocks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect } from "react";

export function NodeLibraryTrigger({ className }: { className?: string }) {
	const { toggleSidebar, open, setOpen } = useSidebar();
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			//Toggle on Cmd+B (Mac) or Ctrl+B (Windows)
			if (e.key.toLowerCase() === "b" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				toggleSidebar();
			}
			//Close on Escape ONLY if the sidebar is currently open
			if (e.key === "Escape" && open) {
				e.preventDefault();
				setOpen(false);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [toggleSidebar, open, setOpen]);
	return (
		<TooltipProvider delayDuration={300}>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						onClick={toggleSidebar}
						className={cn(
							"h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground",
							className
						)}
					>
						<Blocks className="h-5 w-5" />
						<span className="sr-only">Toggle Node Library</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" className="flex items-center gap-2 text-xs">
					Node Library
					<kbd className="pointer-events-none inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 select-none">
						<span className="text-xs">⌘</span>B
					</kbd>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
