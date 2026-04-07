import { LucideIcon } from "lucide-react";

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

export type HandleEntry = {
	id: string;
	label?: string;
	top?: string | number;
	style?: React.CSSProperties;
};

export type NodeConfig = {
	type: string;
	title: string;
	description?: string;
	icon: LucideIcon;
	accentColor?: string;
	minWidth?: number;
	fields?: FieldConfig[];
	handles?: {
		inputs?: HandleEntry[];
		outputs?: HandleEntry[];
	};
};
