import { useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronDown,
  Square,
  ArrowUp,
  ArrowDown,
  AppWindow,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

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

interface ProcessGroup {
  name: string;
  processes: ProcessInfo[];
  totalCpu: number;
  totalMemory: number;
  totalDisk: number;
  totalNetwork: number;
  totalGpu: number;
  icon?: string;
  is_app: boolean;
}

interface SystemStats {
  total_memory: number;
  used_memory: number;
  total_cpu_usage: number;
  disk_total_usage: number;
  network_total_usage: number;
  gpu_total_usage: number;
}

interface ProcessListProps {
  processes: ProcessInfo[];
  selectedPid: number | null;
  onSelect: (pid: number) => void;
  systemStats: SystemStats | null;
  onKill?: (pid: number) => void;
}

const getUsageBackground = (usage: number, maxUsage: number = 100) => {
  const percentage = Math.min((usage / maxUsage) * 100, 100);
  if (percentage < 1) return "";
  const opacity = Math.max(0.15, Math.min(0.6, percentage / 100));
  return `rgba(0, 180, 180, ${opacity})`;
};

const getMemoryUsageBackground = (bytes: number) => {
  const maxBytes = 2 * 1024 * 1024 * 1024;
  const percentage = Math.min((bytes / maxBytes) * 100, 100);
  if (percentage < 1) return "";
  const opacity = Math.max(0.15, Math.min(0.6, percentage / 100));
  return `rgba(0, 180, 180, ${opacity})`;
};

export function ProcessList({
  processes,
  selectedPid,
  onSelect,
  systemStats,
  onKill,
}: ProcessListProps) {
  const { open } = useSidebar();
  const [isSmallWindow, setIsSmallWindow] = useState(false);
  const [appsExpanded, setAppsExpanded] = useState(true);
  const [backgroundExpanded, setBackgroundExpanded] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [sortConfig, setSortConfig] = useState<{
    key: keyof ProcessInfo | "totalCpu" | "totalMemory";
    direction: "asc" | "desc";
  }>({ key: "name", direction: "asc" });

  useEffect(() => {
    const checkSize = () => setIsSmallWindow(window.innerWidth < 1200);
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  const showExtraColumns = !(open && isSmallWindow);

  const formatBytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(1) + " MB";
  };

  const formatDisk = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(1) + " MB/s";
  };

  const formatNetwork = (bytes: number) => {
    const mbps = (bytes * 8) / 1_000_000;
    return mbps.toFixed(1) + " Mbps";
  };

  const handleSort = (key: keyof ProcessInfo) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  const toggleGroupExpanded = (groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const groupedProcesses = useMemo(() => {
    const groups = new Map<string, ProcessGroup>();
    for (const proc of processes) {
      const existing = groups.get(proc.name);
      if (existing) {
        existing.processes.push(proc);
        existing.totalCpu += proc.cpu_usage;
        existing.totalMemory += proc.memory;
        existing.totalDisk += proc.disk_usage;
        existing.totalNetwork += proc.network_usage;
        existing.totalGpu += proc.gpu_usage;
        if (proc.is_app) existing.is_app = true;
        if (!existing.icon && proc.icon) {
          existing.icon = proc.icon;
        } else if (proc.is_app && proc.icon) {
          existing.icon = proc.icon;
        }
      } else {
        groups.set(proc.name, {
          name: proc.name,
          processes: [proc],
          totalCpu: proc.cpu_usage,
          totalMemory: proc.memory,
          totalDisk: proc.disk_usage,
          totalNetwork: proc.network_usage,
          totalGpu: proc.gpu_usage,
          icon: proc.icon,
          is_app: proc.is_app,
        });
      }
    }
    return Array.from(groups.values());
  }, [processes]);

  const sortedGroups = useMemo(() => {
    return [...groupedProcesses].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortConfig.key) {
        case "name":
          aVal = a.name;
          bVal = b.name;
          break;
        case "cpu_usage":
          aVal = a.totalCpu;
          bVal = b.totalCpu;
          break;
        case "memory":
          aVal = a.totalMemory;
          bVal = b.totalMemory;
          break;
        case "disk_usage":
          aVal = a.totalDisk;
          bVal = b.totalDisk;
          break;
        case "network_usage":
          aVal = a.totalNetwork;
          bVal = b.totalNetwork;
          break;
        case "gpu_usage":
          aVal = a.totalGpu;
          bVal = b.totalGpu;
          break;
        default:
          aVal = a.name;
          bVal = b.name;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortConfig.direction === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortConfig.direction === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [groupedProcesses, sortConfig]);

  const appGroups = useMemo(
    () => sortedGroups.filter((g) => g.is_app),
    [sortedGroups],
  );
  const backgroundGroups = useMemo(
    () => sortedGroups.filter((g) => !g.is_app),
    [sortedGroups],
  );

  const SortIndicator = ({ columnKey }: { columnKey: keyof ProcessInfo }) => {
    if (sortConfig.key !== columnKey) return null;
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3 shrink-0" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 shrink-0" />
    );
  };

  const renderChildRow = (proc: ProcessInfo, isAppGroup: boolean) => {
    const isSelected = selectedPid === proc.pid;
    const cpuBg = getUsageBackground(proc.cpu_usage);
    const memBg = getMemoryUsageBackground(proc.memory);

    return (
      <ContextMenu key={proc.pid}>
        <ContextMenuTrigger
          className="group"
          render={
            <tr
              className={cn(
                "h-[34px] border-b border-border-subtle hover:bg-surface-hover cursor-pointer transition-colors duration-75",
                isSelected && "bg-surface-selected hover:bg-surface-selected",
              )}
              onClick={() => onSelect(proc.pid)}
            >
              <td className="pl-3.5 pr-2">
                <div className="flex items-center gap-2 min-w-0 pl-6">
                  <div className="w-[18px] h-[18px] rounded-sm bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden border border-primary/30">
                    <div className="w-2 h-2 rounded-sm bg-primary/70" />
                  </div>
                  <span className="text-[13px] text-muted-foreground truncate">
                    {proc.name} ({proc.pid})
                  </span>
                </div>
              </td>
              <td className="px-3.5 py-0 text-[13px] text-muted-foreground text-left w-[70px]"></td>
              <td
                className="px-3.5 py-0 text-[13px] text-foreground text-right tabular-nums w-[100px]"
                style={{ backgroundColor: cpuBg }}
              >
                {proc.cpu_usage.toFixed(1)} %
              </td>
              <td
                className="px-3.5 py-0 text-[13px] text-foreground text-right tabular-nums w-[110px]"
                style={{ backgroundColor: memBg }}
              >
                {formatBytes(proc.memory)}
              </td>
              <td className="px-3.5 py-0 text-[13px] text-muted-foreground text-right tabular-nums w-[90px]">
                {formatDisk(proc.disk_usage)}
              </td>
              {showExtraColumns && (
                <>
                  <td className="px-4 py-0 text-[13px] text-muted-foreground text-right tabular-nums w-[110px]">
                    {formatNetwork(proc.network_usage)}
                  </td>
                  <td className="px-4 py-0 text-[13px] text-muted-foreground text-right tabular-nums w-[75px]">
                    {proc.gpu_usage.toFixed(0)} %
                  </td>
                </>
              )}
            </tr>
          }
        />
        <ContextMenuContent className="w-56 bg-card border-border text-foreground">
          <ContextMenuItem
            onClick={() => onKill?.(proc.pid)}
            className="gap-2 focus:bg-surface-hover focus:text-foreground"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            <span>End task</span>
            <span className="ml-auto text-xs text-muted-foreground">Del</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderGroupRow = (group: ProcessGroup, isAppGroup: boolean) => {
    const hasMultiple = group.processes.length > 1;
    const isExpanded = expandedGroups.has(group.name);
    const mainProcess = group.processes[0];
    const isSelected = group.processes.some((p) => selectedPid === p.pid);
    const cpuBg = getUsageBackground(group.totalCpu);
    const memBg = getMemoryUsageBackground(group.totalMemory);

    const rows = [];
    rows.push(
      <ContextMenu key={`group-${group.name}`}>
        <ContextMenuTrigger
          className="group"
          render={
            <tr
              className={cn(
                "h-[34px] border-b border-border-subtle hover:bg-surface-hover cursor-pointer transition-colors duration-75",
                isSelected && "bg-surface-selected hover:bg-surface-selected",
              )}
              onClick={() => onSelect(mainProcess.pid)}
            >
              <td className="pl-3.5 pr-2">
                <div className="flex items-center gap-2 min-w-0">
                  {hasMultiple ? (
                    <div
                      className="hover:bg-surface-hover rounded-sm p-0.5 transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroupExpanded(group.name);
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  ) : (
                    <div className="w-4 shrink-0" />
                  )}
                  <div className="w-[18px] h-[18px] rounded-sm  flex items-center justify-center shrink-0 overflow-hidden border border-border-subtle">
                    {isAppGroup && group.icon ? (
                      <img
                        src={group.icon}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-sm border flex items-center justify-center">
                        <AppWindow className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                  <span className="text-[13px] text-foreground truncate">
                    {group.name}{" "}
                    {hasMultiple && (
                      <span className="text-muted-foreground ml-1">
                        ({group.processes.length})
                      </span>
                    )}
                  </span>
                </div>
              </td>
              <td className="px-3.5 py-0 text-[13px] text-muted-foreground text-left w-[70px]"></td>
              <td
                className="px-3.5 py-0 text-[13px] text-foreground text-right tabular-nums w-[100px]"
                style={{ backgroundColor: cpuBg }}
              >
                {group.totalCpu.toFixed(1)} %
              </td>
              <td
                className="px-3.5 py-0 text-[13px] text-foreground text-right tabular-nums w-[110px]"
                style={{ backgroundColor: memBg }}
              >
                {formatBytes(group.totalMemory)}
              </td>
              <td className="px-3.5 py-0 text-[13px] text-muted-foreground text-right tabular-nums w-[90px]">
                {formatDisk(group.totalDisk)}
              </td>
              {showExtraColumns && (
                <>
                  <td className="px-4 py-0 text-[13px] text-muted-foreground text-right tabular-nums w-[110px]">
                    {formatNetwork(group.totalNetwork)}
                  </td>
                  <td className="px-4 py-0 text-[13px] text-muted-foreground text-right tabular-nums w-[75px]">
                    {group.totalGpu.toFixed(0)} %
                  </td>
                </>
              )}
            </tr>
          }
        />
        <ContextMenuContent className="w-56 bg-card border-border text-foreground">
          <ContextMenuItem
            onClick={() => group.processes.forEach((p) => onKill?.(p.pid))}
            className="gap-2 focus:bg-surface-hover focus:text-foreground"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            <span>
              End task{hasMultiple ? ` (${group.processes.length})` : ""}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">Del</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    if (hasMultiple && isExpanded) {
      for (const proc of group.processes) {
        rows.push(renderChildRow(proc, isAppGroup));
      }
    }
    return rows;
  };

  const renderSectionHeader = (
    title: string,
    count: number,
    expanded: boolean,
    onToggle: () => void,
  ) => (
    <tr
      className="h-[34px] border-b border-border-subtle/50 hover:bg-surface-hover cursor-pointer transition-colors"
      onClick={onToggle}
    >
      <td colSpan={showExtraColumns ? 7 : 5} className="px-3.5">
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-[13px] text-foreground font-medium">
            {title} ({count})
          </span>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="flex-1 overflow-auto bg-surface select-none">
      <table className="w-full text-left border-collapse table-fixed">
        <thead className="sticky top-0 bg-surface z-10 border-b border-border">
          <tr className="h-[34px]">
            <th
              className="pl-3.5 pr-2 font-normal text-[12px] text-muted-foreground hover:bg-surface-hover cursor-pointer transition-colors"
              onClick={() => handleSort("name")}
            >
              <div className="flex items-center whitespace-nowrap">
                Name <SortIndicator columnKey="name" />
              </div>
            </th>
            <th
              className="px-3.5 font-normal text-[12px] text-muted-foreground hover:bg-surface-hover cursor-pointer transition-colors w-[70px]"
              onClick={() => handleSort("pid")}
            >
              <div className="flex items-center whitespace-nowrap">
                Status <SortIndicator columnKey="pid" />
              </div>
            </th>
            <th
              className="px-3.5 font-normal text-[12px] text-muted-foreground hover:bg-surface-hover cursor-pointer transition-colors text-right w-[100px]"
              onClick={() => handleSort("cpu_usage")}
            >
              <div className="flex items-center justify-end whitespace-nowrap">
                CPU -{" "}
                {systemStats
                  ? `${systemStats.total_cpu_usage.toFixed(0)}%`
                  : "0%"}{" "}
                <SortIndicator columnKey="cpu_usage" />
              </div>
            </th>
            <th
              className="px-3.5 font-normal text-[12px] text-muted-foreground hover:bg-surface-hover cursor-pointer transition-colors text-right w-[110px]"
              onClick={() => handleSort("memory")}
            >
              <div className="flex items-center justify-end whitespace-nowrap">
                Mem -{" "}
                {systemStats
                  ? `${((systemStats.used_memory / systemStats.total_memory) * 100).toFixed(0)}%`
                  : "0%"}{" "}
                <SortIndicator columnKey="memory" />
              </div>
            </th>
            <th
              className="px-3.5 font-normal text-[12px] text-muted-foreground hover:bg-surface-hover cursor-pointer transition-colors text-right w-[90px]"
              onClick={() => handleSort("disk_usage")}
            >
              <div className="flex items-center justify-end whitespace-nowrap">
                Disk <SortIndicator columnKey="disk_usage" />
              </div>
            </th>
            {showExtraColumns && (
              <>
                <th
                  className="px-3.5 font-normal text-[12px] text-muted-foreground hover:bg-surface-hover cursor-pointer transition-colors text-right w-[110px]"
                  onClick={() => handleSort("network_usage")}
                >
                  <div className="flex items-center justify-end whitespace-nowrap">
                    Network <SortIndicator columnKey="network_usage" />
                  </div>
                </th>
                <th
                  className="px-3.5 font-normal text-[12px] text-muted-foreground hover:bg-surface-hover cursor-pointer transition-colors text-right w-[75px]"
                  onClick={() => handleSort("gpu_usage")}
                >
                  <div className="flex items-center justify-end whitespace-nowrap">
                    GPU <SortIndicator columnKey="gpu_usage" />
                  </div>
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {appGroups.length > 0 && (
            <>
              {renderSectionHeader("Apps", appGroups.length, appsExpanded, () =>
                setAppsExpanded(!appsExpanded),
              )}
              {appsExpanded &&
                appGroups.flatMap((group) => renderGroupRow(group, true))}
            </>
          )}
          {backgroundGroups.length > 0 && (
            <>
              {renderSectionHeader(
                "Background Processes",
                backgroundGroups.length,
                backgroundExpanded,
                () => setBackgroundExpanded(!backgroundExpanded),
              )}
              {backgroundExpanded &&
                backgroundGroups.flatMap((group) =>
                  renderGroupRow(group, false),
                )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
