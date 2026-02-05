import { Minus, Square, X, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSearch } from "@/contexts/search-context";
import { useState } from "react";
import { UpdateDialog } from "@/components/update-dialog";

export function SiteHeader() {
  const appWindow = getCurrentWindow();
  const { searchQuery, setSearchQuery } = useSearch();
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50 w-full bg-surface/70"
      data-tauri-drag-region
    >
      <div
        className="flex h-10 items-center justify-between pl-3 pr-0"
        data-tauri-drag-region
      >
        <div
          className="flex items-center gap-3 min-w-[140px]"
          data-tauri-drag-region
        >
          <img src="/logo.svg" className="h-4 w-4 rounded-sm" alt="Logo" />
          <span className="text-xs font-medium text-foreground">
            Task Manager
          </span>
        </div>

        <div className="flex-1 flex justify-center max-w-md mx-4">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-full pl-8 pr-3 text-xs bg-background/50 border-border-subtle rounded-md focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
        </div>

        <div className="flex items-center ml-auto">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-none hover:bg-surface-hover text-muted-foreground hover:text-foreground"
            onClick={() => setUpdateDialogOpen(true)}
            title="Check for updates"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-12 rounded-none  light:hover:bg-muted text-muted-foreground hover:text-foreground"
            onClick={() => appWindow.minimize()}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-10 rounded-none hover:bg-surface-hover text-muted-foreground hover:text-foreground"
            onClick={() => appWindow.toggleMaximize()}
          >
            <Square className="h-2 w-2" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-12 rounded-none hover:bg-red-600! hover:text-foreground text-muted-foreground"
            onClick={() => appWindow.close()}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <UpdateDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
      />
    </header>
  );
}
