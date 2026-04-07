import ReactFlow, { ReactFlowInstance } from "reactflow";
import { PipelineContainer } from "./pipeline-container";
import { PipelineCustomBackground } from "./pipeline-custom-background";
import { PipelineController } from "./pipeline-controller";
import { useCallback, useRef, useState } from "react";
import { PipelineMinimap } from "./pipeline-minimap";
import { useWorkFlowStore } from "@/hooks";
import { nodeTypes } from "../nodes";

export function PipelineUI() {
	const [showMinimap, setShowMinimap] = useState(true);
	const [isCanvasLocked, setIsCanvasLocked] = useState(false);
	const { nodes, edges, onConnect, addNode, onEdgesChange, onNodesChange, getNodeID } =
		useWorkFlowStore();
	const reactFlowWrapper = useRef<HTMLDivElement>(null);
	const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
	const onDrop = useCallback(
		(event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault();

			if (!reactFlowWrapper.current || !reactFlowInstance) return;

			const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();

			const typeData = event.dataTransfer.getData("application/reactflow");
			if (!typeData) return;

			const appData = JSON.parse(typeData);
			const type = appData?.nodeType;

			if (typeof type === "undefined" || !type) return;

			const position = reactFlowInstance.project({
				x: event.clientX - reactFlowBounds.left,
				y: event.clientY - reactFlowBounds.top
			});

			// Generate a unique ID
			const nodeID = getNodeID(type);

			// Create the new node payload
			const newNode = {
				id: nodeID,
				type,
				position,
				data: { id: nodeID, nodeType: type, nodeName: nodeID }
			};

			// Inject it into the global store
			addNode(newNode);
		},
		[reactFlowInstance, getNodeID, addNode]
	);
	const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
	}, []);
	return (
		<PipelineContainer>
			<div ref={reactFlowWrapper} className="h-full w-full">
				<ReactFlow
					nodes={nodes}
					edges={edges}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					onConnect={onConnect}
					fitView
					nodeTypes={nodeTypes}
					onInit={setReactFlowInstance}
					onDrop={onDrop}
					onDragOver={onDragOver}
					fitViewOptions={{ padding: 0.2 }}
					nodesDraggable={!isCanvasLocked}
					nodesConnectable={!isCanvasLocked}
					elementsSelectable={!isCanvasLocked}
				>
					<PipelineCustomBackground />
					<PipelineController
						onToggleMinimap={() => setShowMinimap(!showMinimap)}
						onToggleLock={setIsCanvasLocked}
					/>
					{showMinimap && <PipelineMinimap />}
				</ReactFlow>
			</div>
		</PipelineContainer>
	);
}
