import { useCallback, useLayoutEffect, useMemo } from "react";
import { NodeProps, useReactFlow, useUpdateNodeInternals } from "reactflow";
import { X } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkFlowStore } from "@/hooks";
import { HandleDot } from "./handle-dot";
import { Separator } from "@/components/ui/separator";
import { Accents } from "./accents";
import { HandleEntry, NodeConfig } from "../types";
import { FieldRenderer } from "./node-fields";
import { Input } from "@/components/ui/input";

const spread = (i: number, n: number) => (n === 1 ? "50%" : `${((i + 1) / (n + 1)) * 100}%`);
const VAR_RE = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}/g;
function extractVars(data: Record<string, any>): string[] {
	const vars = new Set<string>();
	for (const val of Object.values(data ?? {})) {
		if (typeof val !== "string") continue;
		for (const [, name] of val.matchAll(new RegExp(VAR_RE.source, "g"))) {
			if (name) {
				vars.add(name);
			}
		}
	}
	return [...vars];
}
export function BaseNode({ id, data, selected, config }: NodeProps & { config: NodeConfig }) {
	const updateNodeField = useWorkFlowStore((s) => s.updateNodeField);
	const { deleteElements } = useReactFlow();
	const updateNodeInternals = useUpdateNodeInternals();
	const onChange = useCallback(
		(key: string, val: any) => updateNodeField(id, key, val),
		[id, updateNodeField]
	);

	const onDelete = useCallback(() => deleteElements({ nodes: [{ id }] }), [id, deleteElements]);

	const { icon: Icon, accentColor: accent = "var(--primary)", handles, fields } = config;
	const staticInputs = handles?.inputs ?? [];
	const outputs = handles?.outputs ?? [];
	//convert them in to the reactflow format
	const dynamicInputs = useMemo((): HandleEntry[] => {
		return extractVars(data ?? {}).map((name) => ({ id: name, label: name }));
	}, [data]);
	//merge
	const inputs = useMemo(() => {
		const seen = new Set(staticInputs.map((h) => h.id));
		return [...staticInputs, ...dynamicInputs.filter((h) => !seen.has(h.id))];
	}, [staticInputs, dynamicInputs]);
	const nodeName = (data?.nodeName as string) || id;
	const handlesSignature = useMemo(
		() =>
			JSON.stringify({
				inputs: inputs.map((h) => h.id),
				outputs: outputs.map((h) => h.id)
			}),
		[inputs, outputs]
	);
	useLayoutEffect(() => {
		updateNodeInternals(id);
	}, [id, handlesSignature, updateNodeInternals]);
	return (
		<Card
			className={cn(
				"relative overflow-visible rounded-xs border-border p-0 shadow-sm transition-shadow duration-150 hover:shadow-lg",
				selected && "ring-2 ring-ring"
			)}
			style={{ minWidth: config.minWidth ?? 220, borderLeftColor: accent }}
		>
			<Accents selected={selected} />
			<CardHeader className="mx-3 mt-3 flex flex-row items-start justify-between gap-2 space-y-0 rounded-xs bg-primary/20 p-2">
				<div className="flex min-w-0 items-start gap-2">
					<span
						className="mt-0.5 flex-shrink-0 rounded-md p-1"
						style={{ color: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
					>
						<Icon size={14} strokeWidth={2.2} />
					</span>
					<div className="min-w-0">
						<p className="truncate text-sm leading-tight font-semibold">{config.title}</p>
						{config.description && (
							<p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
								{config.description}
							</p>
						)}
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon"
					onClick={onDelete}
					className="nodrag h-6 w-6 text-muted-foreground"
				>
					<X size={12} strokeWidth={2.5} />
				</Button>
			</CardHeader>
			<div className="px-3 pt-1 pb-2.5">
				<Input
					value={nodeName}
					onChange={(e) => onChange("nodeName", e.target.value)}
					placeholder={id}
					className={cn(
						"nodrag text-center text-sm font-semibold",
						"bg-primary/10 text-primary placeholder:text-primary/50",
						"border border-primary/30",
						"rounded-xs"
					)}
				/>
			</div>
			<Separator />
			{fields && fields.length > 0 && (
				<CardContent className="flex flex-col gap-3 px-3 pb-3">
					{fields.map((field) => (
						<div key={field.key} className="flex flex-col gap-1.5">
							{field.type !== "toggle" && (
								<div className="flex items-center justify-between">
									<label className="text-xs font-medium text-muted-foreground">{field.label}</label>
									{field.badge && (
										<span
											className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
											style={{
												color: accent,
												background: `color-mix(in srgb, ${accent} 12%, transparent)`
											}}
										>
											{field.badge}
										</span>
									)}
								</div>
							)}
							<FieldRenderer
								field={field}
								value={data?.[field.key] ?? field.default ?? ""}
								onChange={(val) => onChange(field.key, val)}
								nodeId={id}
							/>
							{field.description && (
								<p className="text-[11px] text-muted-foreground">{field.description}</p>
							)}
						</div>
					))}
				</CardContent>
			)}
			{inputs.map((h, i) => (
				<HandleDot
					key={`in-${h.id}`}
					nodeId={id}
					handle={{ ...h, type: "target", top: h.top ?? spread(i, inputs.length) }}
				/>
			))}
			{outputs.map((h, i) => (
				<HandleDot
					key={`out-${h.id}`}
					nodeId={id}
					handle={{ ...h, type: "source", top: h.top ?? spread(i, outputs.length) }}
				/>
			))}
		</Card>
	);
}
