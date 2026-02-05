import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronLeft,
  Cpu,
  Activity,
  Wifi,
  MonitorPlay,
  HardDrive,
  Settings2,
} from "lucide-react";
import { LineChart } from "@mui/x-charts/LineChart";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";

export const Route = createFileRoute("/_layout/performance/$metricId")({
  component: PerformanceDetailsPage,
});

interface DiskInfo {
  name: string;
  mount_point: string;
  total_space: number;
  available_space: number;
  usage_percent: number;
  disk_type: string;
}

interface MemoryConfigInfo {
  speed_mhz: number;
  slots_used: number;
  slots_total: number;
  form_factor: string;
  hardware_reserved: number;
}

interface HardwareInfo {
  cpu_name: string;
  cpu_cores: number;
  logical_processors: number;
  gpu_name: string;
  gpu_memory_total: number;
  gpu_driver_version: string;
  gpu_driver_date: string;
  gpu_location: string;
  memory_config: MemoryConfigInfo;
}

interface SystemStats {
  total_memory: number;
  used_memory: number;
  total_cpu_usage: number;
  cpu_usage_per_core: number[];
  process_count: number;
  uptime: number;
  handle_count: number;
  thread_count: number;
  committed_memory: number;
  cached_memory: number;
  paged_pool: number;
  non_paged_pool: number;
  disk_total_usage: number;
  network_total_usage: number;
  gpu_total_usage: number;
  gpu_memory_used: number;
  gpu_shared_memory_used: number;
  disks: DiskInfo[];
  hardware: HardwareInfo;
}

interface ProcessesResponse {
  processes: any[];
  stats: SystemStats;
}

const MAX_DATA_POINTS = 60;

function PerformanceDetailsPage() {
  const { metricId } = Route.useParams();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [perCoreHistory, setPerCoreHistory] = useState<number[][]>([]);

  const fetchData = async () => {
    try {
      const response = await invoke<ProcessesResponse>("get_processes");
      setStats(response.stats);

      let currentValue = 0;
      if (metricId === "cpu") {
        currentValue = response.stats.total_cpu_usage;
        setPerCoreHistory((prev) => {
          const newHistory = [...prev];
          response.stats.cpu_usage_per_core.forEach((usage, i) => {
            if (!newHistory[i]) newHistory[i] = [];
            newHistory[i] = [...newHistory[i], usage].slice(-MAX_DATA_POINTS);
          });
          return newHistory;
        });
      } else if (metricId === "memory") {
        currentValue =
          (response.stats.used_memory / response.stats.total_memory) * 100;
      } else if (metricId === "network") {
        currentValue = response.stats.network_total_usage;
      } else if (metricId === "gpu") {
        currentValue = response.stats.gpu_total_usage;
      } else if (metricId.startsWith("disk-")) {
        const mount = metricId.replace("disk-", "");
        const disk = response.stats.disks.find(
          (d) => d.mount_point.replace(/[^a-zA-Z0-9]/g, "") === mount,
        );
        currentValue = disk ? disk.usage_percent : 0;
      }

      setHistory((prev) => [...prev, currentValue].slice(-MAX_DATA_POINTS));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, [metricId]);

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(1);
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${days}:${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr || dateStr === "Unknown") return "Unknown";
    if (dateStr.startsWith("/Date(") && dateStr.endsWith(")/")) {
      const ms = parseInt(dateStr.slice(6, -2), 10);
      return new Date(ms).toLocaleDateString();
    }
    return dateStr;
  };

  const getMetricInfo = () => {
    switch (metricId) {
      case "cpu":
        return {
          title: "CPU",
          subtitle: stats?.hardware.cpu_name || "",
          icon: <Cpu className="h-5 w-5" />,
          color: "#ef4444",
        };
      case "memory":
        return {
          title: "Memory",
          subtitle: `${formatBytes(stats?.total_memory || 0)} GB`,
          icon: <Activity className="h-5 w-5" />,
          color: "#3b82f6",
        };
      case "network":
        return {
          title: "Network",
          subtitle: "Ethernet",
          icon: <Wifi className="h-5 w-5" />,
          color: "#ca8a04",
        };
      case "gpu":
        return {
          title: "GPU",
          subtitle: stats?.hardware.gpu_name || "",
          icon: <MonitorPlay className="h-5 w-5" />,
          color: "#60a5fa",
        };
      default:
        if (metricId.startsWith("disk-")) {
          const mount = metricId.replace("disk-", "");
          const disk = stats?.disks.find(
            (d) => d.mount_point.replace(/[^a-zA-Z0-9]/g, "") === mount,
          );
          return {
            title: `Disk ${disk?.mount_point || ""}`,
            subtitle: `${disk?.name || ""} (${disk?.disk_type || ""})`,
            icon: <HardDrive className="h-5 w-5" />,
            color: "#10b981",
          };
        }
        return {
          title: "Unknown",
          subtitle: "",
          icon: <Activity className="h-5 w-5" />,
          color: "#888",
        };
    }
  };

  const info = getMetricInfo();

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-surface">
      <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/performance"
            className="p-1 hover:bg-surface-hover rounded-md transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-[22px] font-normal text-foreground tracking-tight flex items-center gap-2">
              {info.title}
            </h1>
            <p className="text-[13px] text-muted-foreground">{info.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[28px] font-light text-foreground tabular-nums">
            {metricId === "cpu"
              ? `${stats?.total_cpu_usage.toFixed(0) || 0}%`
              : metricId === "memory"
                ? `${(((stats?.used_memory || 0) / (stats?.total_memory || 1)) * 100).toFixed(0)}%`
                : metricId === "gpu"
                  ? `${stats?.gpu_total_usage.toFixed(0) || 0}%`
                  : ""}
          </span>
          {metricId === "cpu" && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase">
                Utilization
              </p>
              <p className="text-[10px] text-muted-foreground uppercase">
                over 60 seconds
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto bg-surface flex flex-col gap-6">
        <div className="shrink-0 h-[320px]">
          {metricId === "cpu" && perCoreHistory.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1 h-full">
              {perCoreHistory.map((coreData, i) => (
                <div
                  key={i}
                  className="bg-surface-elevated border border-border/40 rounded overflow-hidden flex flex-col"
                >
                  <div className="flex justify-between items-center px-1.5 py-0.5 border-b border-border/20 bg-surface/50">
                    <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-tighter">
                      Core {i}
                    </span>
                    <span className="text-[10px] text-foreground font-medium tabular-nums">
                      {coreData[coreData.length - 1]?.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex-1 relative">
                    <MiniGraph data={coreData} color={info.color} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full bg-surface-elevated border border-border/40 rounded overflow-hidden relative">
              <div className="absolute top-2 left-3 z-10 flex items-baseline gap-2">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
                  % Utilization
                </p>
                <p className="text-[9px] text-muted-foreground/60 uppercase">
                  over 60 seconds
                </p>
              </div>
              <div className="w-full h-full">
                <MainGraph data={history} color={info.color} />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 max-w-5xl">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6">
            {metricId === "cpu" && (
              <>
                <div className="col-span-1">
                  <StatItem
                    label="Utilization"
                    value={`${stats?.total_cpu_usage.toFixed(0)}%`}
                  />
                </div>
                <div className="col-span-1"></div>
                <div className="col-span-3 h-px bg-border/20 my-1" />
                <div className="col-span-1">
                  <StatItem
                    label="Processes"
                    value={stats?.process_count.toString() || "0"}
                  />
                </div>
                <div className="col-span-1">
                  <StatItem
                    label="Threads"
                    value={stats?.thread_count.toString() || "0"}
                  />
                </div>
                <div className="col-span-1">
                  <StatItem
                    label="Handles"
                    value={stats?.handle_count.toString() || "0"}
                  />
                </div>
                <div className="col-span-3 h-px bg-border/20 my-1" />
                <div className="col-span-3">
                  <StatItem
                    label="Up time"
                    value={formatUptime(stats?.uptime || 0)}
                  />
                </div>
              </>
            )}
            {metricId === "memory" && (
              <>
                <div className="col-span-1">
                  <StatItem
                    label="In use"
                    value={`${formatBytes(stats?.used_memory || 0)} GB`}
                  />
                </div>
                <div className="col-span-1">
                  <StatItem
                    label="Available"
                    value={`${formatBytes((stats?.total_memory || 0) - (stats?.used_memory || 0))} GB`}
                  />
                </div>
                <div className="col-span-3 h-px bg-border/20 my-1" />
                <div className="col-span-1">
                  <StatItem
                    label="Committed"
                    value={`${formatBytes(stats?.committed_memory || 0)} GB`}
                  />
                </div>
                <div className="col-span-1">
                  <StatItem
                    label="Cached"
                    value={`${formatBytes(stats?.cached_memory || 0)} GB`}
                  />
                </div>
                <div className="col-span-3 h-px bg-border/20 my-1" />
                <div className="col-span-1">
                  <StatItem
                    label="Paged pool"
                    value={`${formatBytes(stats?.paged_pool || 0)} GB`}
                  />
                </div>
                <div className="col-span-1">
                  <StatItem
                    label="Non-paged pool"
                    value={`${formatBytes(stats?.non_paged_pool || 0)} GB`}
                  />
                </div>
              </>
            )}
            {metricId === "gpu" && (
              <>
                <div className="col-span-1">
                  <StatItem
                    label="3D"
                    value={`${stats?.gpu_total_usage.toFixed(0)}%`}
                  />
                </div>
                <div className="col-span-1"></div>
                <div className="col-span-3 h-px bg-border/20 my-1" />
                <div className="col-span-1">
                  <StatItem
                    label="Dedicated GPU memory"
                    value={`${formatBytes(stats?.gpu_memory_used || 0)} / ${formatBytes(stats?.hardware.gpu_memory_total || 0)} GB`}
                  />
                </div>
                <div className="col-span-1">
                  <StatItem
                    label="Shared GPU memory"
                    value={`${formatBytes(stats?.gpu_shared_memory_used || 0)} / ${formatBytes((stats?.total_memory || 0) / 2)} GB`}
                  />
                </div>
                <div className="col-span-1">
                  <StatItem label="GPU Temperature" value="-- °C" />
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 text-[13px]">
            {metricId === "cpu" && (
              <>
                <StatRow label="Sockets:" value="1" />
                <StatRow
                  label="Cores:"
                  value={stats?.hardware.cpu_cores.toString() || "0"}
                />
                <StatRow
                  label="Logical processors:"
                  value={stats?.hardware.logical_processors.toString() || "0"}
                />
                <StatRow label="Virtualization:" value="Enabled" />
              </>
            )}
            {metricId === "memory" && (
              <>
                <StatRow
                  label="Speed:"
                  value={`${stats?.hardware.memory_config.speed_mhz || 0} MHz`}
                />
                <StatRow
                  label="Slots used:"
                  value={`${stats?.hardware.memory_config.slots_used || 0} of ${stats?.hardware.memory_config.slots_total || 0}`}
                />
                <StatRow
                  label="Form factor:"
                  value={stats?.hardware.memory_config.form_factor || "Unknown"}
                />
                <StatRow
                  label="Hardware reserved:"
                  value={`${Math.round((stats?.hardware.memory_config.hardware_reserved || 0) / (1024 * 1024))} MB`}
                />
              </>
            )}
            {metricId === "gpu" && (
              <>
                <StatRow label="Name:" value={stats?.hardware.gpu_name || ""} />
                <StatRow
                  label="Driver version:"
                  value={stats?.hardware.gpu_driver_version || "Unknown"}
                />
                <StatRow
                  label="Driver date:"
                  value={formatDate(stats?.hardware.gpu_driver_date)}
                />
                <StatRow label="DirectX version:" value="12 (FL 12.1)" />
                <StatRow
                  label="Physical location:"
                  value={stats?.hardware.gpu_location || "PCI bus"}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniGraph({ data, color }: { data: number[]; color: string }) {
  return (
    <SparkLineChart
      data={data}
      height={80}
      curve="linear"
      area
      color={color}
      margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
      sx={{
        "& .MuiAreaElement-root": {
          fillOpacity: 0.15,
        },
        "& .MuiLineElement-root": {
          strokeWidth: 1,
        },
      }}
    />
  );
}

function MainGraph({ data, color }: { data: number[]; color: string }) {
  return (
    <LineChart
      series={[
        {
          data,
          color: color,
          area: true,
          showMark: false,
          connectNulls: true,
        },
      ]}
      height={320}
      margin={{ top: 30, right: 10, bottom: 10, left: 40 }}
      xAxis={[{ data: Array.from({ length: MAX_DATA_POINTS }, (_, i) => i) }]}
      yAxis={[{ min: 0, max: 100, tickNumber: 5 }]}
      sx={{
        "& .MuiAreaElement-root": {
          fillOpacity: 0.1,
        },
        "& .MuiLineElement-root": {
          strokeWidth: 1.5,
        },
        "& .MuiChartsAxis-bottom .MuiChartsAxis-line": {
          stroke: "var(--border)",
        },
        "& .MuiChartsAxis-left .MuiChartsAxis-line": {
          stroke: "var(--border)",
        },
        "& .MuiChartsAxis-tick": {
          stroke: "var(--border)",
        },
        "& .MuiChartsAxis-tickLabel": {
          fill: "var(--muted-foreground)",
          fontSize: "10px",
        },
      }}
    />
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <p className="text-[11px] text-muted-foreground uppercase tracking-tight font-medium">
        {label}
      </p>
      <p className="text-[24px] font-normal text-foreground tabular-nums leading-tight">
        {value}
      </p>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between md:justify-start md:gap-4 items-baseline">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}
