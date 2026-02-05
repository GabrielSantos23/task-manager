import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutGrid,
  Activity,
  History,
  Gauge,
  Users,
  List,
  Puzzle,
  Settings,
  Menu,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { id: "processes", icon: LayoutGrid, label: "Processes", href: "/processes" },
  {
    id: "performance",
    icon: Activity,
    label: "Performance",
    href: "/performance",
  },
  {
    id: "app-history",
    icon: History,
    label: "App history",
    href: "/app-history",
  },
  { id: "startup", icon: Gauge, label: "Startup apps", href: "/startup" },
  { id: "users", icon: Users, label: "Users", href: "/users" },
  { id: "details", icon: List, label: "Details", href: "/details" },
  { id: "services", icon: Puzzle, label: "Services", href: "/services" },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { toggleSidebar, state } = useSidebar();
  const location = useLocation();
  const isCollapsed = state === "collapsed";

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname.startsWith(href);
  };

  return (
    <Sidebar
      collapsible="icon"
      className="top-10 h-[calc(100svh-2.5rem)]!  bg-surface/10"
      {...props}
    >
      <SidebarHeader className="pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors h-10"
              onClick={() => toggleSidebar()}
              tooltip="Toggle Sidebar"
            >
              <Menu className="h-5 w-5 shrink-0" />
              <span
                className={cn(
                  "font-medium transition-opacity duration-200 rounded-md",
                  isCollapsed && "opacity-0 w-0 overflow-hidden rounded-md",
                )}
              >
                Menu
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu className="px-2">
          {navItems.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                tooltip={item.label}
                isActive={isActive(item.href)}
                className={cn(
                  "relative transition-colors mb-1 rounded-sm hover:bg-muted/50!",
                  isActive(item.href) &&
                    "dark:bg-surface-hover! light:bg-muted/50! text-foreground!   ",
                )}
              >
                <Link
                  to={item.href}
                  className="flex items-center gap-2 w-full h-full"
                >
                  <item.icon
                    className={cn(
                      "size-5 shrink-0",
                      isActive(item.href) ? "text-primary" : "",
                    )}
                  />
                  <span
                    className={cn(
                      "transition-opacity duration-200",
                      isCollapsed && "opacity-0 w-0 overflow-hidden",
                    )}
                  >
                    {item.label}
                  </span>

                  {isActive(item.href) && (
                    <div className="absolute left-0 h-5 w-[3px] rounded-r-full bg-primary" />
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="pb-4">
        <SidebarMenu className="px-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Settings"
              asChild
              isActive={isActive("/settings")}
              className={cn(
                "text-muted-foreground hover:text-foreground mb-1 rounded-sm hover:bg-muted/50!",
                isActive("/settings") &&
                  "light:bg-muted/50! dark:bg-surface-hover! text-foreground",
              )}
            >
              <Link
                to="/settings"
                className="flex items-center gap-2 w-full h-full"
              >
                <Settings className="size-5 shrink-0" />
                <span
                  className={cn(
                    "transition-opacity duration-200",
                    isCollapsed && "opacity-0 w-0 overflow-hidden",
                  )}
                >
                  Settings
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
