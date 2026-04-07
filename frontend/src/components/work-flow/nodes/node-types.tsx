import { NODE_LIBRARY } from "@/constants";
import { BaseNode } from "./base-node";
import type { NodeProps } from "reactflow";

// Dynamically build one ReactFlow node component per config entry
export const nodeTypes = Object.fromEntries(
	NODE_LIBRARY.map((config) => [
		config.type,
		// Wrap BaseNode, baking in the config for that type
		(props: NodeProps) => <BaseNode {...props} config={config} />
	])
);
