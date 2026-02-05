import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { useSearch } from "@/contexts/search-context";

export const Route = createFileRoute("/_layout/details")({
  component: DetailsPage,
});

interface ProcessInfo {
  pid: number;
  name: string;
  cpu_usage: number;
  memory: number;
  disk_usage: number;
  network_usage: number;
  gpu_usage: number;
  is_app: boolean;
}

interface ProcessesResponse {
  processes: ProcessInfo[];
  stats: any;
}

function DetailsPage() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const { searchQuery } = useSearch();
  const [selectedPid, setSelectedPid] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      const response = await invoke<ProcessesResponse>("get_processes");
      setProcesses(response.processes);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 K";
    return (bytes / 1024).toFixed(0) + " K";
  };

  const filteredProcesses = processes.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.pid.toString().includes(searchQuery),
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex-1 flex flex-col min-w-0 h-full bg-surface">
        <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border-subtle">
          <h1 className="text-[22px] font-normal text-foreground tracking-tight">
            Details
          </h1>
        </div>

        <div className="shrink-0 px-4 py-2.5 border-b border-border-subtle bg-surface-elevated">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedPid}
              className={cn(
                "h-[30px] gap-2 font-normal px-3 rounded text-[13px]",
                selectedPid
                  ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                  : "text-muted-foreground/50 cursor-not-allowed",
              )}
            >
              <Square className="h-3.5 w-3.5" />
              End task
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead className="sticky top-0 bg-surface-elevated/95 backdrop-blur-sm z-10 border-b border-border">
              <tr className="h-8">
                <th className="pl-4 pr-2 font-medium text-muted-foreground">
                  Name
                </th>
                <th className="px-2 font-medium text-muted-foreground text-right">
                  PID
                </th>
                <th className="px-2 font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-2 font-medium text-muted-foreground text-right">
                  CPU
                </th>
                <th className="px-2 font-medium text-muted-foreground text-right">
                  Memory
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProcesses.map((proc) => (
                <tr
                  key={proc.pid}
                  onClick={() => setSelectedPid(proc.pid)}
                  className={cn(
                    "h-6 border-b border-border-subtle hover:bg-surface-hover cursor-pointer transition-colors",
                    selectedPid === proc.pid && "bg-surface-selected",
                  )}
                >
                  <td className="pl-4 pr-2 py-0 text-foreground truncate max-w-[200px]">
                    {proc.name}
                  </td>
                  <td className="px-2 py-0 text-muted-foreground text-right tabular-nums">
                    {proc.pid}
                  </td>
                  <td className="px-2 py-0 text-muted-foreground">Running</td>
                  <td className="px-2 py-0 text-foreground text-right tabular-nums">
                    {proc.cpu_usage.toFixed(1)}%
                  </td>
                  <td className="px-2 py-0 text-foreground text-right tabular-nums">
                    {formatBytes(proc.memory)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="h-7 bg-surface-elevated border-t border-border-subtle flex items-center px-4 text-[12px] text-muted-foreground shrink-0">
          <span>{filteredProcesses.length} processes</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => fetchData()}>Refresh</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
