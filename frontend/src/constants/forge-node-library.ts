// Forge palette — the left-sidebar node library for ARCHITECTURE design.
// Each item maps 1:1 to a backend node record (layer + kind). Dropping one on the
// canvas persists a real node in the current project. Grouped by layer, plus the
// retained legacy workflow nodes (each mapped to a sensible layer) so a user can
// still hand-compose either way.
import {
	Activity,
	Bell,
	BrainCircuit,
	Box,
	Cloud,
	CreditCard,
	Database,
	Filter,
	GitBranch,
	Globe,
	HardDrive,
	KeyRound,
	LayoutDashboard,
	Lock,
	type LucideIcon,
	Mail,
	MessageSquareText,
	Monitor,
	Network,
	Server,
	Shield,
	Shuffle,
	Smartphone,
	SquareArrowOutUpRight,
	SquareArrowRight,
	Webhook,
} from "lucide-react";

export type ForgeLayer = "client" | "api" | "data" | "integration" | "infra";

export type ForgePaletteNode = {
	type: string; // stored as the node's `kind`
	label: string; // short label on the palette card
	defaultTitle: string; // seeds the node title on drop
	defaultSummary: string; // seeds the node summary on drop
	layer: ForgeLayer;
	category: string; // sidebar group heading
	icon: LucideIcon;
};

export const FORGE_PALETTE: ForgePaletteNode[] = [
	// ---- Client ----
	{ type: "web-app", label: "Web App", defaultTitle: "Web App", defaultSummary: "The primary web client users interact with.", layer: "client", category: "Client", icon: Monitor },
	{ type: "mobile-app", label: "Mobile App", defaultTitle: "Mobile App", defaultSummary: "Native or cross-platform mobile client.", layer: "client", category: "Client", icon: Smartphone },
	{ type: "landing-page", label: "Landing", defaultTitle: "Landing Page", defaultSummary: "Public marketing + signup funnel.", layer: "client", category: "Client", icon: Globe },
	{ type: "admin-dashboard", label: "Admin", defaultTitle: "Admin Dashboard", defaultSummary: "Internal dashboard for operators.", layer: "client", category: "Client", icon: LayoutDashboard },

	// ---- API ----
	{ type: "api-server", label: "API Server", defaultTitle: "API Server", defaultSummary: "Core backend service exposing the app's endpoints.", layer: "api", category: "API", icon: Server },
	{ type: "gateway", label: "Gateway", defaultTitle: "API Gateway", defaultSummary: "Routing / GraphQL / BFF layer in front of services.", layer: "api", category: "API", icon: Network },
	{ type: "worker", label: "Worker", defaultTitle: "Background Worker", defaultSummary: "Async/job processor for long-running work.", layer: "api", category: "API", icon: BrainCircuit },
	{ type: "webhook", label: "Webhook", defaultTitle: "Webhook Handler", defaultSummary: "Receives and processes inbound webhooks.", layer: "api", category: "API", icon: Webhook },

	// ---- Data ----
	{ type: "database", label: "Database", defaultTitle: "Database", defaultSummary: "Primary persistent store (e.g. Postgres).", layer: "data", category: "Data", icon: Database },
	{ type: "cache", label: "Cache", defaultTitle: "Cache / Queue", defaultSummary: "In-memory cache and/or job queue (e.g. Redis).", layer: "data", category: "Data", icon: Box },
	{ type: "object-storage", label: "Storage", defaultTitle: "Object Storage", defaultSummary: "Blob/file storage (e.g. S3).", layer: "data", category: "Data", icon: HardDrive },

	// ---- Integration ----
	{ type: "auth-provider", label: "Auth", defaultTitle: "Auth Provider", defaultSummary: "Managed identity / auth (e.g. Clerk, Supabase).", layer: "integration", category: "Integration", icon: KeyRound },
	{ type: "email", label: "Email", defaultTitle: "Email Provider", defaultSummary: "Transactional email (e.g. Resend, Postmark).", layer: "integration", category: "Integration", icon: Mail },
	{ type: "payments", label: "Payments", defaultTitle: "Payments", defaultSummary: "Billing / payments (e.g. Stripe).", layer: "integration", category: "Integration", icon: CreditCard },
	{ type: "push", label: "Push", defaultTitle: "Push / Notifications", defaultSummary: "Web push / notification delivery.", layer: "integration", category: "Integration", icon: Bell },

	// ---- Infra ----
	{ type: "host", label: "Host", defaultTitle: "Hosting / Deploy", defaultSummary: "Where a service runs (e.g. Vercel, Railway).", layer: "infra", category: "Infra", icon: Cloud },
	{ type: "ci-cd", label: "CI/CD", defaultTitle: "CI/CD Pipeline", defaultSummary: "Automated test/build/deploy (e.g. GitHub Actions).", layer: "infra", category: "Infra", icon: GitBranch },
	{ type: "monitoring", label: "Monitoring", defaultTitle: "Monitoring", defaultSummary: "Error tracking + metrics (e.g. Sentry).", layer: "infra", category: "Infra", icon: Activity },
	{ type: "secrets", label: "Secrets", defaultTitle: "Secrets / Config", defaultSummary: "Env vars + secret management.", layer: "infra", category: "Infra", icon: Lock },

	// ---- Workflow (legacy nodes, kept; mapped to a layer) ----
	{ type: "customInput", label: "Input", defaultTitle: "Input", defaultSummary: "Entry point for data into a flow.", layer: "client", category: "Workflow", icon: SquareArrowRight },
	{ type: "customOutput", label: "Output", defaultTitle: "Output", defaultSummary: "Exit point for data out of a flow.", layer: "client", category: "Workflow", icon: SquareArrowOutUpRight },
	{ type: "llm", label: "LLM", defaultTitle: "LLM", defaultSummary: "Language-model call in the pipeline.", layer: "integration", category: "Workflow", icon: BrainCircuit },
	{ type: "text", label: "Text", defaultTitle: "Text", defaultSummary: "Text/template block with variables.", layer: "api", category: "Workflow", icon: MessageSquareText },
	{ type: "api", label: "API Request", defaultTitle: "API Request", defaultSummary: "Outbound HTTP request to an endpoint.", layer: "integration", category: "Workflow", icon: Globe },
	{ type: "filter", label: "Filter", defaultTitle: "Filter", defaultSummary: "Filter list items by a condition.", layer: "api", category: "Workflow", icon: Filter },
	{ type: "condition", label: "Condition", defaultTitle: "Condition", defaultSummary: "Branch flow on an expression.", layer: "api", category: "Workflow", icon: GitBranch },
	{ type: "transform", label: "Transform", defaultTitle: "Transform", defaultSummary: "Map a function over each item.", layer: "api", category: "Workflow", icon: Shuffle },
	{ type: "datastore", label: "Data Store", defaultTitle: "Data Store", defaultSummary: "Read/write a persistent source.", layer: "data", category: "Workflow", icon: Database },
];

// Visual accent per layer — shared by palette cards, nodes, and the layer legend.
export const LAYER_META: Record<ForgeLayer, { label: string; color: string }> = {
	client: { label: "Client", color: "#a855f7" },
	api: { label: "API", color: "#3b82f6" },
	data: { label: "Data", color: "#0ea5e9" },
	integration: { label: "Integration", color: "#f59e0b" },
	infra: { label: "Infra", color: "#64748b" },
};

// Sidebar group order.
export const PALETTE_CATEGORIES = ["Client", "API", "Data", "Integration", "Infra", "Workflow"] as const;
