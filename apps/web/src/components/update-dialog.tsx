import { useEffect, useState } from "react";
import { useUpdater } from "@/hooks/use-updater";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpdateDialog({ open, onOpenChange }: UpdateDialogProps) {
  const {
    checking,
    available,
    downloading,
    progress,
    error,
    updateInfo,
    checkForUpdates,
    downloadAndInstall,
    dismissUpdate,
  } = useUpdater();

  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    if (open && !hasChecked) {
      checkForUpdates();
      setHasChecked(true);
    }
  }, [open, hasChecked, checkForUpdates]);

  const handleClose = () => {
    if (!downloading) {
      dismissUpdate();
      onOpenChange(false);
      setHasChecked(false);
    }
  };

  const handleCheckAgain = () => {
    setHasChecked(false);
    checkForUpdates();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] bg-surface border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            {downloading ? (
              <>
                <Download className="h-5 w-5 animate-pulse" />
                Downloading Update
              </>
            ) : available ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Update Available
              </>
            ) : error ? (
              <>
                <AlertCircle className="h-5 w-5 text-red-500" />
                Update Error
              </>
            ) : checking ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                Checking for Updates
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Up to Date
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {downloading
              ? "Please wait while the update is being downloaded and installed..."
              : available && updateInfo
                ? `Version ${updateInfo.version} is available. You are currently on version ${updateInfo.currentVersion}.`
                : error
                  ? error
                  : checking
                    ? "Checking GitHub releases for updates..."
                    : "You are running the latest version."}
          </DialogDescription>
        </DialogHeader>

        {downloading && (
          <div className="py-4">
            <Progress value={progress} className="h-2">
              <span className="sr-only">{progress}%</span>
            </Progress>
            <p className="text-sm text-muted-foreground text-center mt-2">
              {progress}% complete
            </p>
          </div>
        )}

        {available && updateInfo?.body && !downloading && (
          <div className="py-2">
            <h4 className="text-sm font-medium text-foreground mb-2">
              What's new:
            </h4>
            <div className="text-sm text-muted-foreground bg-surface-elevated p-3 rounded-md max-h-[150px] overflow-y-auto whitespace-pre-wrap">
              {updateInfo.body}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {error && (
            <Button
              variant="outline"
              onClick={handleCheckAgain}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          )}

          {!checking && !downloading && !available && !error && (
            <Button
              variant="outline"
              onClick={handleCheckAgain}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Check Again
            </Button>
          )}

          {available && !downloading && (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Later
              </Button>
              <Button onClick={downloadAndInstall} className="gap-2">
                <Download className="h-4 w-4" />
                Update Now
              </Button>
            </>
          )}

          {!available && !error && !checking && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Simple button to trigger update check
export function UpdateButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setDialogOpen(true)}
        className="h-8 w-8"
        title="Check for updates"
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
      <UpdateDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
