import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { FieldConfig } from "../types";
import { MentionInput } from "./mention-input";

export function FieldRenderer({
	field,
	value,
	onChange,
	nodeId
}: {
	field: FieldConfig;
	value: any;
	onChange: (val: any) => void;
	nodeId: string;
}) {
	switch (field.type) {
		case "textarea":
			return (
				<MentionInput
					nodeId={nodeId}
					field={field}
					value={value || ""}
					onChange={onChange}
					multiline
				/>
			);
		case "text":
			return <MentionInput nodeId={nodeId} field={field} value={value || ""} onChange={onChange} />;
		case "select":
			return (
				<Select value={value || ""} onValueChange={onChange}>
					<SelectTrigger className="nodrag rounded-xs bg-background">
						<SelectValue placeholder={field.placeholder || "Select..."} />
					</SelectTrigger>
					<SelectContent>
						{field.options?.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			);
		case "toggle":
			return (
				<div className="mt-2 flex items-center justify-between">
					<Label className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
						{field.label}
					</Label>
					<Switch checked={!!value} onCheckedChange={onChange} className="nodrag" />
				</div>
			);
		default:
			return (
				<Input
					type={field.type}
					value={value || ""}
					placeholder={field.placeholder}
					onChange={(e) => onChange(e.target.value)}
					className={cn(
						"nodrag rounded-xs bg-background",
						field.key.includes("Name") && "border-primary/20 bg-primary/5 text-center font-medium"
					)}
				/>
			);
	}
}
