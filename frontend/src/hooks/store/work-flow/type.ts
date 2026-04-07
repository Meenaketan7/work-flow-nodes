import type { Connection, Edge, EdgeChange, Node, NodeChange } from "reactflow";
type NodeIDMap = Record<string, number>;
export interface PipelineState {
	nodes: Node<NodeData>[];
	edges: Edge[];
	_nodeIDs: NodeIDMap;
}

export interface NodeData {
	id: string;
	nodeType: string;
	nodeName?: string;
	[key: string]: unknown;
}

export interface PipelineActions {
	getNodeID: (type: string) => string;
	addNode: (node: Node<NodeData>) => void;
	updateNodeField: (nodeId: string, field: string, value: unknown) => void;
	addAutoEdge: (edge: Edge) => void;
	onNodesChange: (changes: NodeChange[]) => void;
	onEdgesChange: (changes: EdgeChange[]) => void;
	onConnect: (connection: Connection) => void;

	onSubmit: () => any;

	clearPipeline: () => void;
}
export type PipelineStore = PipelineState & PipelineActions;
