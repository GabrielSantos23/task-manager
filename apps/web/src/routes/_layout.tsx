import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SiteHeader } from "@/components/header";

export const Route = createFileRoute("/_layout")({
  component: LayoutComponent,
});

function LayoutComponent() {
  return (
    <div
      className="h-screen w-screen overflow-hidden bg-transparent text-foreground transition-colors duration-300"
      onContextMenu={(e) => e.preventDefault()}
    >
      <SidebarProvider defaultOpen={false} className="flex flex-col h-full">
        <SiteHeader />
        <div className="flex flex-1 overflow-hidden bg-surface/70">
          <AppSidebar />
          <SidebarInset className="overflow-hidden bg-background rounded-xl m-2 ml-0">
            <Outlet />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
