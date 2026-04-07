import { useRef, useState, useCallback, ReactNode } from "react";
import "reactflow/dist/style.css";
export function PipelineContainer({ children }: { children: ReactNode }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [isHovering, setIsHovering] = useState(false);

	const handleMouseMove = useCallback((e: React.MouseEvent) => {
		if (!containerRef.current) return;
		const rect = containerRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		containerRef.current.style.setProperty("--mouse-x", `${x}px`);
		containerRef.current.style.setProperty("--mouse-y", `${y}px`);
	}, []);
	return (
		<div
			ref={containerRef}
			onMouseMove={handleMouseMove}
			onMouseEnter={() => setIsHovering(true)}
			onMouseLeave={() => setIsHovering(false)}
			className="relative h-full w-full overflow-hidden"
			style={
				{
					"--mouse-opacity": isHovering ? 1 : 0
				} as React.CSSProperties
			}
		>
			{children}
		</div>
	);
}
