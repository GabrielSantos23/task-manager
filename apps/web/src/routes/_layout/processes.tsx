import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  Play,
  XCircle,
  Gauge,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcessList } from "@/components/process-list";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSearch } from "@/contexts/search-context";

export const Route = createFileRoute("/_layout/processes")({
  component: ProcessesPage,
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
  icon?: string;
}

interface SystemStats {
  total_memory: number;
  used_memory: number;
  total_cpu_usage: number;
  disk_total_usage: number;
  network_total_usage: number;
  gpu_total_usage: number;
}

interface ProcessesResponse {
  processes: ProcessInfo[];
  stats: SystemStats;
}

function ProcessesPage() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const { searchQuery } = useSearch();
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const response = await invoke<ProcessesResponse>("get_processes");
      setProcesses(response.processes);
      setStats(response.stats);
      setLoading(false);
      setError(null);
    } catch (e: any) {
      console.error(e);
      setError(e.toString());
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleKill = async (pidToKill?: number) => {
    const targetPid = pidToKill || selectedPid;
    if (!targetPid) return;
    try {
      const success = await invoke<boolean>("kill_process", {
        pid: targetPid,
      });
      if (success) {
        toast.success(`Process ${targetPid} killed successfully`);
        fetchData();
        if (targetPid === selectedPid) {
          setSelectedPid(null);
        }
      } else {
        toast.error(`Failed to kill process ${targetPid}`);
      }
    } catch (e) {
      toast.error("Error invoking kill_process command");
    }
  };

  const filteredProcesses = processes.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.pid.toString().includes(searchQuery),
  );

  if (error && processes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-4 bg-surface text-foreground">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load Task Manager</h2>
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button
          onClick={fetchData}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-surface">
      <div className="px-4 py-3 shrink-0 border-b border-border-subtle flex items-center justify-between">
        <h1 className="text-[20px] font-normal text-foreground tracking-tight">
          Processes
        </h1>

        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-[28px] gap-2 text-muted-foreground hover:text-foreground hover:bg-surface-hover font-normal px-2.5 rounded text-[12px] transition-colors"
          >
            <Play className="h-3.5 w-3.5" />
            Run new task
          </Button>

          <Button
            variant="ghost"
            size="sm"
            disabled={!selectedPid}
            onClick={() => handleKill()}
            className={cn(
              "h-[28px] gap-2 font-normal px-2.5 rounded text-[12px] transition-colors",
              selectedPid
                ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                : "text-muted-foreground/50 cursor-not-allowed",
            )}
          >
            <XCircle className="h-3.5 w-3.5" />
            End task
          </Button>

          <Button
            variant="ghost"
            size="sm"
            disabled={!selectedPid}
            className={cn(
              "h-[28px] gap-2 font-normal px-2.5 rounded text-[12px] transition-colors",
              selectedPid
                ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                : "text-muted-foreground/50 cursor-not-allowed",
            )}
          >
            <Gauge className="h-3.5 w-3.5" />
            Efficiency mode
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-[28px] w-[28px] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <ProcessList
          processes={filteredProcesses}
          selectedPid={selectedPid}
          onSelect={setSelectedPid}
          onKill={handleKill}
          systemStats={stats}
        />
      </div>
    </div>
  );
}
