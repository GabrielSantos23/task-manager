import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "sonner";
import { useSearch } from "@/contexts/search-context";

export const Route = createFileRoute("/_layout/startup")({
  component: StartupPage,
});

interface StartupApp {
  name: string;
  path: string;
  publisher: string;
  enabled: boolean;
  location: string;
  icon: string | null;
}

interface StartupData {
  apps: StartupApp[];
  last_bios_time: number;
}

function StartupPage() {
  const [apps, setApps] = useState<StartupApp[]>([]);
  const [lastBiosTime, setLastBiosTime] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const { searchQuery } = useSearch();

  const fetchApps = async () => {
    try {
      const result = await invoke<StartupData>("get_startup_apps");
      setApps(result.apps);
      setLastBiosTime(result.last_bios_time);
      setLoading(false);
    } catch (e) {
      console.error("Failed to fetch startup apps:", e);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const handleToggle = async (app: StartupApp, enabled: boolean) => {
    try {
      const success = await invoke<boolean>("toggle_startup_app", {
        name: app.name,
        enabled,
      });

      if (success) {
        setApps((prev) =>
          prev.map((a) => (a.name === app.name ? { ...a, enabled } : a)),
        );
        toast.success(`${app.name} ${enabled ? "enabled" : "disabled"}`);
      } else {
        toast.error(`Failed to ${enabled ? "enable" : "disable"} ${app.name}`);
      }
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  };

  const filteredApps = apps.filter(
    (app) =>
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.publisher.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const enabledCount = apps.filter((a) => a.enabled).length;
  const disabledCount = apps.filter((a) => !a.enabled).length;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex-1 flex flex-col min-w-0 h-full bg-surface">
        <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border-subtle">
          <h1 className="text-[22px] font-normal text-foreground tracking-tight">
            Startup Apps
          </h1>
        </div>

        <div className="shrink-0 px-4 py-3 border-b border-border-subtle bg-surface-elevated flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="text-[13px] text-muted-foreground">
              Choose which applications should start with Windows
            </p>
            {lastBiosTime > 0 && (
              <p className="text-[12px] text-muted-foreground/80">
                Last BIOS time: {(lastBiosTime / 1000).toFixed(1)} s
              </p>
            )}
          </div>
          <div className="flex gap-4 text-[13px]">
            <span className="text-green-500 dark:text-green-400">
              {enabledCount} enabled
            </span>
            <span className="text-muted-foreground">
              {disabledCount} disabled
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Loading startup apps...
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              {searchQuery
                ? "No matching startup apps found"
                : "No startup apps found"}
            </div>
          ) : (
            filteredApps.map((app) => (
              <StartupAppCard
                key={app.name}
                app={app}
                onToggle={handleToggle}
              />
            ))
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => fetchApps()}>Refresh</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface StartupAppCardProps {
  app: StartupApp;
  onToggle: (app: StartupApp, enabled: boolean) => void;
}

function StartupAppCard({ app, onToggle }: StartupAppCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 hover:border-border/80 transition-colors group">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-muted flex-shrink-0 overflow-hidden">
          {app.icon ? (
            <img
              src={app.icon}
              alt={app.name}
              className="w-8 h-8 object-contain"
            />
          ) : (
            <Package className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-medium text-foreground truncate">
            {app.name}
          </h3>
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="truncate">{app.publisher}</span>
            <span className="text-border">|</span>
            <span className="text-muted-foreground/70">{app.location}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className={cn(
              "text-[13px] font-medium min-w-[32px] text-right",
              app.enabled
                ? "text-green-500 dark:text-green-400"
                : "text-muted-foreground",
            )}
          >
            {app.enabled ? "On" : "Off"}
          </span>

          <Switch
            checked={app.enabled}
            onCheckedChange={(checked) => onToggle(app, checked)}
            className="data-[state=checked]:bg-primary"
          />

          <button
            onClick={() => {
              console.log("Open:", app.path);
            }}
            className="p-1.5 hover:bg-surface-hover rounded transition-colors text-muted-foreground hover:text-foreground"
            title="Open file location"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
