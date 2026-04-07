import {
	SquareArrowRight,
	SquareArrowOutUpRight,
	BrainCircuit,
	MessageSquareText,
	Globe,
	Filter,
	GitBranch,
	Shuffle,
	Database,
	LucideIcon
} from "lucide-react";

export type FieldConfig = {
	key: string;
	label: string;
	type: "text" | "textarea" | "select" | "number" | "toggle";
	default?: any;
	placeholder?: string;
	options?: { label: string; value: string }[];
	badge?: string;
	description?: string;
};

export type NodeTypeConfig = {
	type: string;
	label: string;
	title: string;
	description: string;
	icon: LucideIcon;
	accentColor?: string;
	fields?: FieldConfig[];
	category?: string;
	handles?: {
		inputs?: { id: string; label?: string }[];
		outputs?: { id: string; label?: string }[];
	};
};

export const NODE_LIBRARY: NodeTypeConfig[] = [
	{
		type: "customInput",
		label: "Input",
		title: "Input",
		description: "Entry point to pass data into your workflow.",
		icon: SquareArrowRight,
		category: "I/O",
		handles: {
			outputs: [{ id: "value" }]
		},
		fields: [
			{
				key: "inputType",
				label: "Type",
				type: "select",
				default: "Text",
				options: [
					{ value: "Text", label: "Text" },
					{ value: "File", label: "File" }
				]
			}
		]
	},
	{
		type: "customOutput",
		label: "Output",
		title: "Output",
		description: "Exit point to output data from your workflow.",
		icon: SquareArrowOutUpRight,
		category: "I/O",
		handles: {
			inputs: [{ id: "value" }]
		},
		fields: [
			{ key: "outputName", label: "Name", type: "text", placeholder: "output_1" },
			{
				key: "outputType",
				label: "Type",
				type: "select",
				default: "Text",
				options: [
					{ value: "Text", label: "Text" },
					{ value: "Image", label: "Image" }
				]
			}
		]
	},
	{
		type: "llm",
		label: "LLM",
		title: "LLM",
		description: "Run a prompt through a language model.",
		icon: BrainCircuit,
		category: "Processing",
		accentColor: "#a78bfa",
		handles: {
			inputs: [
				{ id: "system", label: "system" },
				{ id: "prompt", label: "prompt" }
			],
			outputs: [{ id: "response", label: "response" }]
		},
		fields: [
			{
				key: "model",
				label: "Model",
				type: "select",
				default: "gpt-4o",
				options: [
					{ value: "gpt-4o", label: "GPT-4o" },
					{ value: "gpt-4o-mini", label: "GPT-4o Mini" },
					{ value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
					{ value: "claude-haiku-4-5", label: "Claude Haiku 4.5" }
				]
			},
			{
				key: "temperature",
				label: "Temperature",
				type: "select",
				default: "0.7",
				options: ["0", "0.3", "0.5", "0.7", "1.0"].map((v) => ({ value: v, label: v }))
			}
		]
	},
	{
		type: "text",
		label: "Text",
		title: "Text",
		category: "Processing",
		description: "Text block with {{ variables }}",
		icon: MessageSquareText,

		handles: { outputs: [{ id: "output" }] },
		fields: [{ key: "text", label: "Text", type: "textarea", default: "" }]
	},
	{
		type: "api",
		label: "API Request",
		title: "API Request",
		category: "Processing",
		description: "Fetch data from an HTTP endpoint.",
		icon: Globe,
		accentColor: "#38bdf8",
		handles: {
			inputs: [
				{ id: "body", label: "body" },
				{ id: "headers", label: "headers" }
			],
			outputs: [{ id: "response", label: "response" }]
		},
		fields: [
			{ key: "url", label: "URL", type: "text", placeholder: "https://api.example.com" },
			{
				key: "method",
				label: "Method",
				type: "select",
				default: "GET",
				options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((v) => ({ value: v, label: v }))
			},
			{ key: "auth", label: "Bearer Auth", type: "toggle", default: false }
		]
	},
	{
		type: "filter",
		label: "Filter",
		title: "Filter",
		category: "Logic",
		description: "Filter list items by a condition.",
		icon: Filter,
		accentColor: "#34d399",
		handles: {
			inputs: [
				{ id: "list", label: "list" },
				{ id: "cond", label: "condition" }
			],
			outputs: [
				{ id: "passed", label: "passed" },
				{ id: "rejected", label: "rejected" }
			]
		},
		fields: [
			{ key: "field", label: "Field key", type: "text", placeholder: "e.g. status" },
			{
				key: "operator",
				label: "Operator",
				type: "select",
				default: "equals",
				options: [
					{ value: "equals", label: "= equals" },
					{ value: "not_equals", label: "≠ not equals" },
					{ value: "contains", label: "⊂ contains" },
					{ value: "gt", label: "> greater than" },
					{ value: "lt", label: "< less than" }
				]
			},
			{ key: "value", label: "Value", type: "text", placeholder: "e.g. active" }
		]
	},
	{
		type: "condition",
		label: "Condition",
		title: "Condition",
		category: "Logic",
		description: "Route flow based on an expression.",
		icon: GitBranch,
		accentColor: "#fbbf24",
		handles: {
			inputs: [{ id: "input" }],
			outputs: [
				{ id: "true", label: "true" },
				{ id: "false", label: "false" }
			]
		},
		fields: [
			{
				key: "expression",
				label: "Expression",
				type: "textarea",
				placeholder: "e.g. value > 100"
			},
			{
				key: "language",
				label: "Language",
				type: "select",
				default: "js",
				options: [
					{ value: "js", label: "JavaScript" },
					{ value: "python", label: "Python" }
				]
			}
		]
	},
	{
		type: "transform",
		label: "Transform",
		title: "Transform",
		category: "Logic",
		description: "Map a function over each item.",
		icon: Shuffle,
		accentColor: "#f472b6",
		handles: {
			inputs: [{ id: "input" }],
			outputs: [{ id: "output" }]
		},
		fields: [
			{
				key: "code",
				label: "Mapping code",
				type: "textarea",
				placeholder: "(item) => ({ ...item, name: item.name.toUpperCase() })"
			},
			{
				key: "language",
				label: "Language",
				type: "select",
				default: "js",
				options: [
					{ value: "js", label: "JavaScript" },
					{ value: "python", label: "Python" }
				]
			},
			{ key: "async", label: "Async execution", type: "toggle", default: false }
		]
	},
	{
		type: "datastore",
		label: "Data Store",
		title: "Data Store",
		category: "Store",
		description: "Read or write to a persistent source.",
		icon: Database,
		accentColor: "#c084fc",
		handles: {
			inputs: [
				{ id: "query", label: "query" },
				{ id: "write", label: "write" }
			],
			outputs: [{ id: "result", label: "result" }]
		},
		fields: [
			{
				key: "storeType",
				label: "Store type",
				type: "select",
				default: "postgres",
				options: [
					{ value: "postgres", label: "PostgreSQL" },
					{ value: "mysql", label: "MySQL" },
					{ value: "mongodb", label: "MongoDB" },
					{ value: "redis", label: "Redis" },
					{ value: "pinecone", label: "Pinecone (Vector)" }
				]
			},
			{
				key: "connection",
				label: "Connection",
				type: "text",
				placeholder: "postgresql://user:pass@host/db"
			},
			{ key: "collection", label: "Table / Collection", type: "text", placeholder: "users" },
			{ key: "cache", label: "Cache results", type: "toggle", default: true }
		]
	}
];
