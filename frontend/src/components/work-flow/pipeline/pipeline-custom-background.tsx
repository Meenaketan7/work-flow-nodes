import { Background } from "reactflow";

export function PipelineCustomBackground() {
	return (
		<>
			<Background id="base-dots" color="var(--muted-foreground)" gap={12} size={1} />
			<Background
				id="highlight-dots"
				color="var(--foreground)"
				gap={12}
				size={1.5}
				style={{
					opacity: "var(--mouse-opacity)",
					transition: "opacity 0.3s ease",
					WebkitMaskImage: `radial-gradient(150px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), black 0%, transparent 100%)`,
					maskImage: `radial-gradient(150px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), black 0%, transparent 100%)`
				}}
			/>
		</>
	);
}
