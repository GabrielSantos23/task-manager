import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  MonitorPlay,
  ChevronRight,
} from "lucide-react";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";

export const Route = createFileRoute("/_layout/performance/")({
  component: PerformancePage,
});

interface DiskInfo {
  name: string;
  mount_point: string;
  total_space: number;
  available_space: number;
  usage_percent: number;
  disk_type: string;
}

interface HardwareInfo {
  cpu_name: string;
  cpu_cores: number;
  logical_processors: number;
  gpu_name: string;
}

interface ProcessesResponse {
  processes: any[];
  stats: SystemStats;
}

const MAX_DATA_POINTS = 60;

const DISK_COLORS = ["#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#8b5cf6"];

function PerformancePage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
  const [diskHistories, setDiskHistories] = useState<Map<string, number[]>>(
    new Map(),
  );
  const [networkHistory, setNetworkHistory] = useState<number[]>([]);
  const [gpuHistory, setGpuHistory] = useState<number[]>([]);

  const fetchData = async () => {
    try {
      const response = await invoke<ProcessesResponse>("get_processes");
      setStats(response.stats);

      setCpuHistory((prev) => {
        const newHistory = [...prev, response.stats.total_cpu_usage];
        return newHistory.slice(-MAX_DATA_POINTS);
      });

      const memoryPercent =
        (response.stats.used_memory / response.stats.total_memory) * 100;
      setMemoryHistory((prev) => {
        const newHistory = [...prev, memoryPercent];
        return newHistory.slice(-MAX_DATA_POINTS);
      });

      setDiskHistories((prev) => {
        const newHistories = new Map(prev);
        for (const disk of response.stats.disks) {
          const key = disk.mount_point;
          const currentHistory = newHistories.get(key) || [];
          const newHistory = [...currentHistory, disk.usage_percent];
          newHistories.set(key, newHistory.slice(-MAX_DATA_POINTS));
        }
        return newHistories;
      });

      setNetworkHistory((prev) => {
        const newHistory = [...prev, response.stats.network_total_usage];
        return newHistory.slice(-MAX_DATA_POINTS);
      });

      setGpuHistory((prev) => {
        const newHistory = [...prev, response.stats.gpu_total_usage];
        return newHistory.slice(-MAX_DATA_POINTS);
      });
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(1);
  };

  const memoryPercent = stats
    ? ((stats.used_memory / stats.total_memory) * 100).toFixed(0)
    : 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-surface">
      <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border-subtle">
        <h1 className="text-[22px] font-normal text-foreground tracking-tight">
          Performance
        </h1>
      </div>
      <div className="flex-1 p-3 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <PerformanceCard
            metricId="cpu"
            icon={<Cpu className="h-4 w-4" />}
            title="CPU"
            subtitle={stats?.hardware.cpu_name || "Unknown CPU"}
            detailLine={`${stats?.hardware.cpu_cores || 0} cores • ${stats?.total_cpu_usage.toFixed(0) ?? 0}% utilization`}
            value={`${stats?.total_cpu_usage.toFixed(0) ?? 0}%`}
            maxValue="100%"
            minValue="0%"
            data={cpuHistory}
            color="#ef4444"
            accentColor="border-red-500/30"
          />

          <PerformanceCard
            metricId="memory"
            icon={<Activity className="h-4 w-4" />}
            title="Memory"
            subtitle={`${stats ? formatBytes(stats.total_memory) : 0} GB`}
            detailLine={`${stats ? formatBytes(stats.used_memory) : 0}/${stats ? formatBytes(stats.total_memory) : 0} GB (${memoryPercent}%)`}
            value={`${stats ? formatBytes(stats.total_memory) : 0} GB`}
            maxValue="100%"
            minValue="0"
            data={memoryHistory}
            color="#3b82f6"
            accentColor="border-blue-500/30"
          />

          <PerformanceCard
            metricId="network"
            icon={<Wifi className="h-4 w-4" />}
            title="Network"
            subtitle="Ethernet"
            detailLine={`${((stats?.network_total_usage ?? 0) / 1024).toFixed(1)} KB/s`}
            value={`${((stats?.network_total_usage ?? 0) / 1024).toFixed(1)} KB/s`}
            maxValue="Auto"
            minValue="0"
            data={networkHistory}
            color="#ca8a04"
            accentColor="border-yellow-600/30"
          />

          <PerformanceCard
            metricId="gpu"
            icon={<MonitorPlay className="h-4 w-4" />}
            title="GPU"
            subtitle={stats?.hardware.gpu_name || "Unknown GPU"}
            detailLine={`${stats?.gpu_total_usage.toFixed(0) ?? 0}% utilization`}
            value={`${stats?.gpu_total_usage.toFixed(0) ?? 0}%`}
            maxValue="100%"
            minValue="0"
            data={gpuHistory}
            color="#60a5fa"
            accentColor="border-blue-400/30"
          />

          {stats?.disks.map((disk, index) => {
            const diskHistory = diskHistories.get(disk.mount_point) || [];
            const color = DISK_COLORS[index % DISK_COLORS.length];
            const usedSpace = disk.total_space - disk.available_space;
            const diskId = `disk-${disk.mount_point.replace(/[^a-zA-Z0-9]/g, "")}`;

            return (
              <PerformanceCard
                key={disk.mount_point}
                metricId={diskId}
                icon={<HardDrive className="h-4 w-4" />}
                title={`Disk ${disk.mount_point}`}
                subtitle={`${disk.name || disk.disk_type} (${disk.disk_type})`}
                detailLine={`${formatBytes(usedSpace)}/${formatBytes(disk.total_space)} GB used (${disk.usage_percent.toFixed(0)}%)`}
                value={`${disk.usage_percent.toFixed(0)}%`}
                maxValue="100%"
                minValue="0"
                data={diskHistory}
                color={color}
                accentColor={`border-[${color}]/30`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface PerformanceCardProps {
  metricId: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  detailLine: string;
  value: string;
  maxValue: string;
  minValue: string;
  data: number[];
  color: string;
  accentColor: string;
}

function PerformanceCard({
  metricId,
  icon,
  title,
  subtitle,
  detailLine,
  value,
  maxValue,
  minValue,
  data,
  color,
  accentColor,
}: PerformanceCardProps) {
  const chartData = data.length > 0 ? data : [0];

  return (
    <Link
      to="/performance/$metricId"
      params={{ metricId }}
      className="bg-card border border-border rounded-lg overflow-hidden hover:border-border/80 transition-colors group cursor-pointer block no-underline"
    >
      <div className="px-3 py-2.5 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="text-muted-foreground shrink-0">{icon}</div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-medium text-foreground truncate">
              {title}
            </h3>
            <p className="text-[11px] text-muted-foreground truncate">
              {subtitle}
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 transition-colors" />
      </div>

      <div className="px-3 py-3 relative">
        <div className="flex justify-between items-start mb-1.5">
          <span className="text-[10px] text-muted-foreground truncate max-w-[60%]">
            {detailLine}
          </span>
          <span className="text-[11px] text-muted-foreground font-medium tabular-nums">
            {maxValue}
          </span>
        </div>

        <div
          className={`relative h-[100px] bg-surface rounded border ${accentColor} overflow-hidden`}
        >
          <SparkLineChart
            data={chartData}
            height={100}
            curve="linear"
            area
            showHighlight
            showTooltip
            color={color}
            margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
            sx={{
              "& .MuiAreaElement-root": {
                fill: color,
                fillOpacity: 0.2,
              },
              "& .MuiLineElement-root": {
                stroke: color,
                strokeWidth: 1.5,
              },
            }}
          />
        </div>

        <div className="flex justify-between items-center mt-1.5">
          <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
            60 seconds
          </span>
          <span className="text-[10px] text-muted-foreground/70 tabular-nums">
            {minValue}
          </span>
        </div>
      </div>
    </Link>
  );
}
