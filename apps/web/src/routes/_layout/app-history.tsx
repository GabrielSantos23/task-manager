import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useState, useEffect } from "react";
import { useSearch } from "@/contexts/search-context";

export const Route = createFileRoute("/_layout/app-history")({
  component: AppHistoryPage,
});

interface AppHistoryInfo {
  name: string;
  cpu_time_ms: number;
  network_bytes: number;
  disk_bytes: number;
  icon: string | null;
}

function formatCpuTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function AppHistoryPage() {
  const [history, setHistory] = useState<AppHistoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const { searchQuery } = useSearch();

  const fetchHistory = async () => {
    try {
      const data = await invoke<AppHistoryInfo[]>("get_app_history");
      setHistory(data);
    } catch (err) {
      console.error("Failed to fetch app history:", err);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    try {
      await invoke("clear_app_history");
      setHistory([]);
    } catch (err) {
      console.error("Failed to clear app history:", err);
    }
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredHistory = history.filter((app) =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex-1 flex flex-col min-w-0 h-full bg-surface">
        <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border-subtle">
          <h1 className="text-[22px] font-normal text-foreground tracking-tight">
            App history
          </h1>
        </div>

        <div className="shrink-0 px-4 py-2.5 border-b border-border-subtle bg-surface-elevated">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearHistory}
              className="h-[30px] gap-2 text-muted-foreground hover:text-foreground hover:bg-surface-hover font-normal px-3 rounded text-[13px]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete usage history
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-surface-elevated/95 backdrop-blur-sm z-10 border-b border-border">
              <tr className="h-9">
                <th className="pl-4 pr-2 font-medium text-[12px] text-muted-foreground">
                  Name
                </th>
                <th className="px-3 font-medium text-[12px] text-muted-foreground text-right w-[100px]">
                  CPU time
                </th>
                <th className="px-3 font-medium text-[12px] text-muted-foreground text-right w-[100px]">
                  Network
                </th>
                <th className="px-3 font-medium text-[12px] text-muted-foreground text-right w-[100px]">
                  Disk
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Loading...
                  </td>
                </tr>
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {searchQuery
                      ? "No matching apps found."
                      : "No usage history recorded yet. Start using apps to see their resource usage."}
                  </td>
                </tr>
              ) : (
                filteredHistory.map((app, idx) => (
                  <tr
                    key={idx}
                    className="h-8 border-b border-border-subtle hover:bg-surface-hover transition-colors"
                  >
                    <td className="pl-4 pr-2 py-0">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {app.icon ? (
                            <img
                              src={app.icon}
                              alt=""
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {app.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="text-[13px] text-foreground truncate">
                          {app.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-0 text-[13px] text-muted-foreground text-right tabular-nums">
                      {formatCpuTime(app.cpu_time_ms)}
                    </td>
                    <td className="px-3 py-0 text-[13px] text-muted-foreground text-right tabular-nums">
                      {formatBytes(app.network_bytes)}
                    </td>
                    <td className="px-3 py-0 text-[13px] text-muted-foreground text-right tabular-nums">
                      {formatBytes(app.disk_bytes)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="h-7 bg-surface-elevated border-t border-border-subtle flex items-center px-4 text-[12px] text-muted-foreground shrink-0">
          <span>
            {history.length > 0
              ? `${history.length} apps tracked since last reset`
              : "Resource usage since last reset"}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => fetchHistory()}>
          Refresh
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={clearHistory}
          className="text-red-500 focus:text-red-500"
        >
          Delete history
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
