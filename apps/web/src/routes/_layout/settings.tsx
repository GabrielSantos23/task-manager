import { createFileRoute } from "@tanstack/react-router";
import { Settings, Palette, Bell, Info, Download } from "lucide-react";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/components/theme-provider";
import { UpdateDialog } from "@/components/update-dialog";

export const Route = createFileRoute("/_layout/settings")({
  component: SettingsPage,
});

interface AppSettings {
  defaultStartPage: string;
  updateSpeed: string;
  theme: string;
  alwaysOnTop: boolean;
  cpuAlert: boolean;
  startWithPC: boolean;
}

const defaultSettings: AppSettings = {
  defaultStartPage: "processes",
  updateSpeed: "normal",
  theme: "dark",
  alwaysOnTop: false,
  cpuAlert: true,
  startWithPC: false,
};

function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("taskManagerSettings");
    return saved
      ? { ...defaultSettings, ...JSON.parse(saved) }
      : defaultSettings;
  });
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  const saveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem("taskManagerSettings", JSON.stringify(newSettings));
  };

  const handleDefaultPageChange = (value: string) => {
    saveSettings({ ...settings, defaultStartPage: value });
  };

  const handleUpdateSpeedChange = (value: string) => {
    saveSettings({ ...settings, updateSpeed: value });
    window.dispatchEvent(
      new CustomEvent("updateSpeedChange", { detail: value }),
    );
  };

  const { theme, setTheme } = useTheme();

  const handleThemeChange = (value: string) => {
    saveSettings({ ...settings, theme: value });
    setTheme(value);
  };

  const handleAlwaysOnTopChange = async (checked: boolean) => {
    try {
      await invoke("set_always_on_top", { onTop: checked });
      saveSettings({ ...settings, alwaysOnTop: checked });
    } catch (err) {
      console.error("Failed to set always on top:", err);
    }
  };

  const handleCpuAlertChange = (checked: boolean) => {
    saveSettings({ ...settings, cpuAlert: checked });
  };

  const handleStartWithPCChange = async (checked: boolean) => {
    try {
      await invoke("set_auto_start", { enabled: checked });
      saveSettings({ ...settings, startWithPC: checked });
    } catch (err) {
      console.error("Failed to set auto start:", err);
    }
  };

  useEffect(() => {
    if (settings.alwaysOnTop) {
      invoke("set_always_on_top", { onTop: true }).catch(console.error);
    }
    if (settings.theme && settings.theme !== theme) {
      setTheme(settings.theme);
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-background">
      <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border">
        <h1 className="text-[22px] font-normal text-foreground tracking-tight">
          Settings
        </h1>
      </div>

      <div className="flex-1 overflow-auto p-4 min-h-0">
        <div className=" space-y-4">
          <section>
            <h2 className="text-[15px] font-medium text-foreground mb-3 flex items-center gap-2">
              <Settings className="h-4 w-4 text-foreground" />
              General
            </h2>
            <div className="space-y-2">
              <SettingCard
                title="Default start page"
                description="Choose which page to show on startup"
              >
                <Select
                  value={settings.defaultStartPage}
                  onValueChange={handleDefaultPageChange}
                >
                  <SelectTrigger className="w-[180px] h-[32px] bg-accent rounded-sm border-border text-foreground text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-accent border-border text-foreground">
                    <SelectItem
                      value="processes"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      Processes
                    </SelectItem>
                    <SelectItem
                      value="performance"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      Performance
                    </SelectItem>
                    <SelectItem
                      value="app-history"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      App history
                    </SelectItem>
                    <SelectItem
                      value="startup"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      Startup apps
                    </SelectItem>
                    <SelectItem
                      value="users"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      Users
                    </SelectItem>
                    <SelectItem
                      value="services"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      Services
                    </SelectItem>
                  </SelectContent>
                </Select>
              </SettingCard>

              <SettingCard
                title="Real-time update speed"
                description="How often to refresh data"
              >
                <Select
                  value={settings.updateSpeed}
                  onValueChange={handleUpdateSpeedChange}
                >
                  <SelectTrigger className="w-[180px] h-[32px] rounded-sm bg-accent border-border text-foreground text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-accent border-border text-foreground">
                    <SelectItem
                      value="high"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      High (500ms)
                    </SelectItem>
                    <SelectItem
                      value="normal"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      Normal (1s)
                    </SelectItem>
                    <SelectItem
                      value="low"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      Low (2s)
                    </SelectItem>
                    <SelectItem
                      value="paused"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      Paused
                    </SelectItem>
                  </SelectContent>
                </Select>
              </SettingCard>

              <SettingCard
                title="Start with PC"
                description="Launch Task Manager automatically when you start your computer"
              >
                <Switch
                  checked={settings.startWithPC}
                  onCheckedChange={handleStartWithPCChange}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingCard>
            </div>
          </section>

          <section>
            <h2 className="text-[15px] font-medium text-foreground mb-3 flex items-center gap-2">
              <Palette className="h-4 w-4 text-foreground" />
              Appearance
            </h2>
            <div className="space-y-2">
              <SettingCard title="Theme" description="Select application theme">
                <Select
                  value={theme || settings.theme}
                  onValueChange={handleThemeChange}
                >
                  <SelectTrigger className="w-[180px] h-[32px] bg-accent rounded-sm border-border text-foreground text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-accent border-border text-foreground">
                    <SelectItem
                      value="dark"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      Dark
                    </SelectItem>
                    <SelectItem
                      value="light"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      Light
                    </SelectItem>
                    <SelectItem
                      value="system"
                      className="text-[13px] focus:bg-accent/50"
                    >
                      System
                    </SelectItem>
                  </SelectContent>
                </Select>
              </SettingCard>

              <SettingCard
                title="Always on top"
                description="Keep window above other applications"
              >
                <Switch
                  checked={settings.alwaysOnTop}
                  onCheckedChange={handleAlwaysOnTopChange}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingCard>
            </div>
          </section>

          <section>
            <h2 className="text-[15px] font-medium text-foreground mb-3 flex items-center gap-2">
              <Bell className="h-4 w-4 text-foreground" />
              Notifications
            </h2>
            <div className="space-y-2">
              <SettingCard
                title="High CPU usage alert"
                description="Notify when CPU usage exceeds threshold"
              >
                <Switch
                  checked={settings.cpuAlert}
                  onCheckedChange={handleCpuAlertChange}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingCard>
            </div>
          </section>
          <section>
            <h2 className="text-[15px] font-medium text-foreground mb-3 flex items-center gap-2">
              <Download className="h-4 w-4 text-foreground" />
              Updates
            </h2>
            <div className="space-y-2">
              <SettingCard
                title="Check for updates"
                description="Check if a new version is available on GitHub"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUpdateDialogOpen(true)}
                  className="h-8 text-[13px]"
                >
                  Check Now
                </Button>
              </SettingCard>
            </div>
          </section>

          <section>
            <h2 className="text-[15px] font-medium text-foreground mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-foreground" />
              About
            </h2>
            <div className="p-4 bg-card border border-border rounded-lg">
              <p className="text-[14px] text-foreground font-medium">
                Task Manager
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Version 0.1.0
              </p>
              <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed">
                A modern task manager built with Tauri, React, and Rust.
              </p>
            </div>
          </section>
        </div>
      </div>

      <UpdateDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
      />
    </div>
  );
}

interface SettingCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

function SettingCard({ title, description, children }: SettingCardProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:border-white/[0.12] transition-colors">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-[13px] text-foreground font-medium">{title}</p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {description}
        </p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
