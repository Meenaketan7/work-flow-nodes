import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { PipelineStore } from "./type";
import { addEdge, applyNodeChanges, applyEdgeChanges, Edge, MarkerType } from "reactflow";

export const EDGE_DEFAULTS = {
	type: "simplebezier",
	animated: true,
	style: { stroke: "var(--primary)", strokeWidth: 2 },
	markerEnd: {
		type: MarkerType.ArrowClosed,
		width: 16,
		height: 16,
		color: "var(--primary)"
	}
} satisfies Partial<Edge>;
export const useWorkFlowStore = create<PipelineStore>()(
	devtools(
		persist(
			(set, get) => ({
				// Initial state
				nodes: [],
				edges: [],
				_nodeIDs: {},
				//generate node id
				getNodeID: (type) => {
					const ids = { ...get()._nodeIDs };
					ids[type] = (ids[type] ?? 0) + 1;
					set({ _nodeIDs: ids });
					return `${type}-${ids[type]}`;
				},
				//addnode
				addNode: (node) => {
					set((state) => ({ nodes: [...state.nodes, node] }));
				},
				// to update a single field in node data here
				updateNodeField: (nodeId, field, value) => {
					set((state) => ({
						nodes: state.nodes.map((node) =>
							node.id === nodeId ? { ...node, data: { ...node.data, [field]: value } } : node
						)
					}));
				},
				//to create the connection by {{}}

				addAutoEdge: (edge) => {
					set((state) => {
						if (state.edges.some((e) => e.id === edge.id)) return state;
						return {
							edges: [...state.edges, { ...EDGE_DEFAULTS, ...edge }]
						};
					});
				},
				//react flow  handler
				onNodesChange: (changes) => {
					set((state) => ({
						nodes: applyNodeChanges(changes, state.nodes)
					}));
				},
				onEdgesChange: (changes) => {
					set((state) => ({
						edges: applyEdgeChanges(changes, state.edges)
					}));
				},
				onConnect: (connection) => {
					set((state) => ({
						edges: addEdge({ ...EDGE_DEFAULTS, ...connection }, state.edges)
					}));
				},
				//handle submit
				onSubmit: async () => {
					const { nodes, edges } = get();
					try {
						const response = await fetch("http://localhost:8000/pipelines/parse", {
							method: "POST",
							headers: {
								"Content-Type": "application/json"
							},
							body: JSON.stringify({ nodes, edges })
						});
						if (!response.ok) {
							throw new Error(`API Error: ${response.status}`);
						}
						const data = await response.json();
						return data;
					} catch (err) {
						console.error("Failed to submit pipeline:", err);
						throw err;
					}
				},
				//handle reset
				clearPipeline: () => {
					set({ nodes: [], edges: [], _nodeIDs: {} });
				}
			}),
			{ name: "workflow-pipeline-storage" }
		)
	)
);
