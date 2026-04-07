import { cn } from "@/lib/utils";

export function Accents({
	selected,
	sizeClass = "h-2.5 w-2.5"
}: {
	selected?: boolean;
	sizeClass?: string;
}) {
	type CornerPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

	const cornerStyles: Record<CornerPosition, string> = {
		"top-left": "-top-[1px] -left-[1px] rounded-tl-xs",
		"top-right": "-top-[1px] -right-[1px] rounded-tr-xs",
		"bottom-left": "-bottom-[1px] -left-[1px] rounded-bl-xs",
		"bottom-right": "-bottom-[1px] -right-[1px] rounded-br-xs"
	};

	const positions: CornerPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

	return (
		<>
			{positions.map((pos) => (
				<div
					key={pos}
					className={cn(
						"absolute bg-border transition-colors",
						sizeClass,
						cornerStyles[pos],
						selected && "bg-primary"
					)}
				/>
			))}
		</>
	);
}
