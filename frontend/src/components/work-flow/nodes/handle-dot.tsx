import { cn } from "@/lib/utils";
import { Handle, HandleType, Position } from "reactflow";

export interface HandleConfig {
	id: string;
	type: HandleType;
	top?: string | number;
	label?: string;
	style?: React.CSSProperties;
}

export interface HandleDotProps {
	nodeId: string;
	handle: HandleConfig;
}

export const HandleDot: React.FC<HandleDotProps> = ({ nodeId, handle }) => {
	const isSource = handle.type === "source";

	return (
		<>
			<Handle
				type={handle.type}
				position={isSource ? Position.Right : Position.Left}
				id={`${nodeId}-${handle.id}`}
				isConnectable={true}
				className={cn(
					"z-10 !h-3.5 !w-3.5 !border-[2.5px] !bg-background",
					isSource ? "!-right-[7px]" : "!-left-[7px]"
				)}
				style={{
					top: handle.top ?? "50%",
					borderColor: "var(--primary)",
					...handle.style
				}}
			/>
			{handle.label && (
				<span
					className={cn(
						"pointer-events-none absolute text-[10px] font-normal text-muted-foreground",
						isSource ? "left-full ml-3 text-left" : "right-full mr-3 text-right"
					)}
					style={{
						top: handle.top ?? "50%",
						transform: "translateY(-50%)"
					}}
				>
					{handle.label}
				</span>
			)}{" "}
		</>
	);
};
