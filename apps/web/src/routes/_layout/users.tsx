import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import {
  User,
  LogOut,
  RefreshCw,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useSearch } from "@/contexts/search-context";

export const Route = createFileRoute("/_layout/users")({
  component: UsersPage,
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
  icon: string | null;
}

interface UserSessionInfo {
  username: string;
  domain: string;
  session_id: number;
  status: string;
  cpu_usage: number;
  memory_bytes: number;
  process_count: number;
  processes: ProcessInfo[];
}

interface ProcessGroup {
  name: string;
  processes: ProcessInfo[];
  totalCpu: number;
  totalMemory: number;
  icon: string | null;
  is_app: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function ProcessRow({
  group,
  isExpanded,
  onToggle,
}: {
  group: ProcessGroup;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="h-8 border-b border-border-subtle hover:bg-surface-hover transition-colors group/row cursor-pointer"
        onClick={onToggle}
      >
        <td className="pl-12 pr-2 py-0">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 flex items-center justify-center">
              {group.processes.length > 1 &&
                (isExpanded ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                ))}
            </div>
            <div className="w-5 h-5 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
              {group.icon ? (
                <img
                  src={group.icon}
                  alt=""
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {group.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <span className="text-[13px] text-foreground truncate">
              {group.name}
              {group.processes.length > 1 && (
                <span className="ml-1.5 text-muted-foreground text-[11px]">
                  ({group.processes.length})
                </span>
              )}
            </span>
          </div>
        </td>
        <td className="px-3 py-0"></td>
        <td className="px-3 py-0"></td>
        <td className="px-3 py-0"></td>
        <td className="px-3 py-0 text-[13px] text-foreground text-right tabular-nums">
          {group.totalCpu.toFixed(1)}%
        </td>
        <td className="px-3 py-0 text-[13px] text-foreground text-right tabular-nums">
          {formatBytes(group.totalMemory)}
        </td>
      </tr>
      {isExpanded &&
        group.processes.length > 1 &&
        group.processes.map((proc) => (
          <tr
            key={proc.pid}
            className="h-7 border-b border-border-subtle/50 hover:bg-surface-hover transition-colors"
          >
            <td className="pl-[72px] pr-2 py-0">
              <span className="text-[12px] text-muted-foreground tabular-nums">
                PID: {proc.pid}
              </span>
            </td>
            <td className="px-3 py-0"></td>
            <td className="px-3 py-0"></td>
            <td className="px-3 py-0"></td>
            <td className="px-3 py-0 text-[12px] text-muted-foreground text-right tabular-nums">
              {proc.cpu_usage.toFixed(1)}%
            </td>
            <td className="px-3 py-0 text-[12px] text-muted-foreground text-right tabular-nums">
              {formatBytes(proc.memory)}
            </td>
          </tr>
        ))}
    </>
  );
}

function UserRow({
  user,
  isExpanded,
  onToggle,
  isSelected,
  onSelect,
}: {
  user: UserSessionInfo;
  isExpanded: boolean;
  onToggle: () => void;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groupedProcesses = useMemo(() => {
    const groups = new Map<string, ProcessGroup>();
    for (const proc of user.processes) {
      const existing = groups.get(proc.name);
      if (existing) {
        existing.processes.push(proc);
        existing.totalCpu += proc.cpu_usage;
        existing.totalMemory += proc.memory;
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
          icon: proc.icon,
          is_app: proc.is_app,
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) => b.totalCpu - a.totalCpu);
  }, [user.processes]);

  const toggleGroup = (groupName: string) => {
    const next = new Set(expandedGroups);
    if (next.has(groupName)) {
      next.delete(groupName);
    } else {
      next.add(groupName);
    }
    setExpandedGroups(next);
  };

  return (
    <>
      <tr
        onClick={() => {
          onSelect();
        }}
        className={cn(
          "h-11 border-b border-border-subtle hover:bg-surface-hover transition-colors cursor-pointer group/row",
          isSelected ? "bg-surface-selected hover:bg-surface-selected" : "",
        )}
      >
        <td className="pl-4 pr-2 py-0">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              <span className="text-[13px] text-foreground block font-medium">
                {user.domain}\\{user.username}
              </span>
            </div>
          </div>
        </td>
        <td className="px-3 py-0">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                user.status === "Active"
                  ? "bg-green-500 dark:bg-green-400"
                  : "bg-yellow-500 dark:bg-yellow-400",
              )}
            />
            <span className="text-[13px] text-muted-foreground">
              {user.status}
            </span>
          </div>
        </td>
        <td className="px-3 py-0 text-[13px] text-muted-foreground text-right tabular-nums">
          {user.session_id}
        </td>
        <td className="px-3 py-0 text-[13px] text-muted-foreground text-right tabular-nums">
          {user.process_count}
        </td>
        <td className="px-3 py-0 text-[13px] text-foreground text-right tabular-nums">
          {user.cpu_usage.toFixed(1)}%
        </td>
        <td className="px-3 py-0 text-[13px] text-foreground text-right tabular-nums">
          {formatBytes(user.memory_bytes)}
        </td>
      </tr>
      {isExpanded &&
        groupedProcesses.map((group) => (
          <ProcessRow
            key={group.name}
            group={group}
            isExpanded={expandedGroups.has(group.name)}
            onToggle={() => toggleGroup(group.name)}
          />
        ))}
    </>
  );
}

function UsersPage() {
  const [users, setUsers] = useState<UserSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const { searchQuery } = useSearch();

  const fetchUsers = async () => {
    try {
      const data = await invoke<UserSessionInfo[]>("get_user_sessions");
      setUsers(data);
    } catch (err) {
      console.error("Failed to fetch user sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 2000);
    return () => clearInterval(interval);
  }, []);

  const toggleUserExpanded = (username: string) => {
    const next = new Set(expandedUsers);
    if (next.has(username)) {
      next.delete(username);
    } else {
      next.add(username);
    }
    setExpandedUsers(next);
  };

  const handleDisconnect = async () => {
    if (!selectedUser) return;
    console.log("Disconnect user:", selectedUser);
  };

  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.domain.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex-1 flex flex-col min-w-0 h-full bg-surface">
        <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border-subtle">
          <h1 className="text-[22px] font-normal text-foreground tracking-tight">
            Users
          </h1>
        </div>

        <div className="shrink-0 px-4 py-2.5 border-b border-border-subtle bg-surface-elevated">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedUser}
              onClick={handleDisconnect}
              className="h-[30px] gap-2 text-muted-foreground hover:text-foreground hover:bg-surface-hover font-normal px-3 rounded text-[13px] disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Disconnect
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchUsers}
              className="h-[30px] gap-2 text-muted-foreground hover:text-foreground hover:bg-surface-hover font-normal px-3 rounded text-[13px]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-surface-elevated/95 backdrop-blur-sm z-10 border-b border-border">
              <tr className="h-9">
                <th className="pl-4 pr-2 font-medium text-[12px] text-muted-foreground">
                  User
                </th>
                <th className="px-3 font-medium text-[12px] text-muted-foreground">
                  Status
                </th>
                <th className="px-3 font-medium text-[12px] text-muted-foreground text-right">
                  ID
                </th>
                <th className="px-3 font-medium text-[12px] text-muted-foreground text-right">
                  Processes
                </th>
                <th className="px-3 font-medium text-[12px] text-muted-foreground text-right">
                  CPU
                </th>
                <th className="px-3 font-medium text-[12px] text-muted-foreground text-right">
                  Memory
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Loading...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {searchQuery
                      ? "No matching users found."
                      : "No user sessions found."}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <UserRow
                    key={user.username}
                    user={user}
                    isExpanded={expandedUsers.has(user.username)}
                    onToggle={() => toggleUserExpanded(user.username)}
                    isSelected={selectedUser === user.username}
                    onSelect={() => setSelectedUser(user.username)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="h-7 bg-surface-elevated border-t border-border-subtle flex items-center px-4 text-[12px] text-muted-foreground shrink-0">
          <span>
            {users.length} user session{users.length !== 1 ? "s" : ""}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => fetchUsers()}>Refresh</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
