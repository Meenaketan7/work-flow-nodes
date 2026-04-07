import { AppSidebar } from "./app-sidebar";
import { SidebarInset, SidebarProvider } from "./sidebar";
import { SiteHeader } from "./site-header";

function Layout({ children }: { children: React.ReactNode }) {
	return (
		<div>
			<SidebarProvider
				style={
					{
						"--sidebar-width": "18rem",
						"--header-height": "3.5rem",
						"--sidebar": "var(--card)",
						"--sidebar-border": "transparent"
					} as React.CSSProperties
				}
			>
				<AppSidebar variant="inset" />
				<SidebarInset className="flex flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
					<SiteHeader />
					<main className="relative flex-1 overflow-hidden">{children}</main>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}

export default Layout;
