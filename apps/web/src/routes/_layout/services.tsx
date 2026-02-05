import { createFileRoute } from "@tanstack/react-router";
import { Play, Square, RotateCcw, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSearch } from "@/contexts/search-context";

export const Route = createFileRoute("/_layout/services")({
  component: ServicesPage,
});

interface ServiceInfo {
  name: string;
  pid: number | null;
  description: string;
  status: string;
}

function ServicesPage() {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { searchQuery } = useSearch();

  const fetchServices = async () => {
    try {
      const data = await invoke<ServiceInfo[]>("get_services");
      setServices(data);
    } catch (err) {
      console.error("Failed to fetch services:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleServiceAction = async (action: "start" | "stop" | "restart") => {
    if (!selectedService) return;
    setActionLoading(true);
    try {
      const success = await invoke<boolean>("manage_service", {
        name: selectedService,
        action,
      });
      if (success) {
        await fetchServices();
      }
    } catch (err) {
      console.error(`Failed to ${action} service:`, err);
    } finally {
      setActionLoading(false);
    }
  };

  const openServicesWindow = async () => {
    try {
      await invoke("manage_service", { name: "", action: "open_msc" });
    } catch (err) {
      console.error("Failed to open services window");
    }
  };

  const selectedData = services.find((s) => s.name === selectedService);

  const filteredServices = services.filter(
    (service) =>
      service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex-1 flex flex-col min-w-0 h-full bg-surface">
        <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border-subtle">
          <h1 className="text-[22px] font-normal text-foreground tracking-tight">
            Services
          </h1>
        </div>

        <div className="shrink-0 px-4 py-2.5 border-b border-border-subtle bg-surface-elevated">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleServiceAction("start")}
              disabled={
                !selectedService ||
                selectedData?.status === "Running" ||
                actionLoading
              }
              className="h-[30px] gap-2 text-muted-foreground hover:text-foreground hover:bg-surface-hover font-normal px-3 rounded text-[13px] disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Start
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleServiceAction("stop")}
              disabled={
                !selectedService ||
                selectedData?.status === "Stopped" ||
                actionLoading
              }
              className="h-[30px] gap-2 text-muted-foreground hover:text-foreground hover:bg-surface-hover font-normal px-3 rounded text-[13px] disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleServiceAction("restart")}
              disabled={!selectedService || actionLoading}
              className="h-[30px] gap-2 text-muted-foreground hover:text-foreground hover:bg-surface-hover font-normal px-3 rounded text-[13px] disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restart
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchServices}
              className="h-[30px] gap-2 text-muted-foreground hover:text-foreground hover:bg-surface-hover font-normal px-3 rounded text-[13px]"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", loading && "animate-spin")}
              />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={openServicesWindow}
              className="h-[30px] gap-2 text-muted-foreground hover:text-foreground hover:bg-surface-hover font-normal px-3 rounded text-[13px]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Services
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
                <th className="px-3 font-medium text-[12px] text-muted-foreground text-right w-[80px]">
                  PID
                </th>
                <th className="px-3 font-medium text-[12px] text-muted-foreground">
                  Description
                </th>
                <th className="px-3 font-medium text-[12px] text-muted-foreground w-[120px]">
                  Status
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
                    Loading services...
                  </td>
                </tr>
              ) : filteredServices.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {searchQuery
                      ? "No matching services found."
                      : "No services found."}
                  </td>
                </tr>
              ) : (
                filteredServices.map((service) => (
                  <tr
                    key={service.name}
                    onClick={() => setSelectedService(service.name)}
                    className={cn(
                      "h-8 border-b border-border-subtle hover:bg-surface-hover transition-colors cursor-pointer",
                      selectedService === service.name &&
                        "bg-surface-selected hover:bg-surface-selected",
                    )}
                  >
                    <td className="pl-4 pr-2 py-0 text-[13px] text-foreground truncate max-w-[200px]">
                      {service.name}
                    </td>
                    <td className="px-3 py-0 text-[13px] text-muted-foreground text-right tabular-nums">
                      {service.pid || "-"}
                    </td>
                    <td className="px-3 py-0 text-[13px] text-muted-foreground truncate max-w-[400px]">
                      {service.description}
                    </td>
                    <td className="px-3 py-0">
                      <span
                        className={cn(
                          "text-[13px]",
                          service.status === "Running"
                            ? "text-green-500 dark:text-green-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {service.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="h-7 bg-surface-elevated border-t border-border-subtle flex items-center px-4 text-[12px] text-muted-foreground shrink-0">
          <span>{services.length} services found</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {selectedService && (
          <>
            <ContextMenuItem
              onClick={() => handleServiceAction("start")}
              disabled={selectedData?.status === "Running" || actionLoading}
            >
              Start
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleServiceAction("stop")}
              disabled={selectedData?.status === "Stopped" || actionLoading}
            >
              Stop
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleServiceAction("restart")}
              disabled={actionLoading}
            >
              Restart
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={() => fetchServices()}>
          Refresh
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
