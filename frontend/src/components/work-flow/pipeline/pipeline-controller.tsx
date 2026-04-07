import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Layers, Maximize, Unlock, ZoomIn, ZoomOut, Lock } from "lucide-react";
import { useCallback, useState } from "react";
import { Panel, useReactFlow, useViewport } from "reactflow";
//--- Helper Component to prevent repetitive Tooltip/Button code ---
function ControlButton({
	icon: Icon,
	label,
	onClick,
	isActive = false
}: {
	icon: React.ElementType;
	label: string;
	onClick: () => void;
	isActive?: boolean;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className={cn(
						"h-8 w-8 rounded-full transition-colors",
						isActive
							? "bg-primary/10 text-primary"
							: "text-muted-foreground hover:bg-muted hover:text-foreground"
					)}
					onClick={onClick}
				>
					<Icon className="h-4 w-4" />
					<span className="sr-only">{label}</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top" className="mb-1 text-xs">
				{label}
			</TooltipContent>
		</Tooltip>
	);
}
// --- Main Controls Component ---
export function PipelineController({
	onToggleMinimap,
	onToggleLock
}: {
	onToggleMinimap?: () => void;
	onToggleLock?: (isLocked: boolean) => void;
}) {
	const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
	const { zoom } = useViewport();

	const [isLocked, setIsLocked] = useState(false);
	const handleLockToggle = useCallback(() => {
		const newState = !isLocked;
		setIsLocked(newState);
		onToggleLock?.(newState);
	}, [isLocked, onToggleLock]);
	return (
		<Panel position="bottom-center" className="mb-6">
			<TooltipProvider delayDuration={300}>
				<div className="flex animate-in items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 shadow-xl duration-700 ease-out fill-mode-both zoom-in-95 fade-in slide-in-from-bottom-8">
					<div className="flex items-center gap-2">
						<ControlButton
							icon={ZoomOut}
							label="Zoom Out"
							onClick={() => zoomOut({ duration: 200 })}
						/>
						<div className="w-24 px-1">
							<Slider
								value={[zoom ?? 1]}
								min={0.5}
								max={2.0}
								step={0.05}
								onValueChange={(val) => zoomTo(val[0] ?? 1, { duration: 0 })}
								className="cursor-grab active:cursor-grabbing"
							/>
						</div>
						<ControlButton
							icon={ZoomIn}
							label="Zoom In"
							onClick={() => zoomIn({ duration: 200 })}
						/>
						<Separator orientation="vertical" />
						<ControlButton
							icon={Maximize}
							label="Fit to View"
							onClick={() => fitView({ duration: 400, padding: 0.2 })}
						/>
						<ControlButton
							icon={isLocked ? Lock : Unlock}
							label={isLocked ? "Unlock Canvas" : "Lock Canvas"}
							onClick={handleLockToggle}
							isActive={isLocked}
						/>
						{onToggleMinimap && (
							<ControlButton icon={Layers} label="Toggle Minimap" onClick={onToggleMinimap} />
						)}
					</div>
				</div>
			</TooltipProvider>
		</Panel>
	);
}
