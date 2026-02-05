import { useState, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

export interface UpdateState {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  progress: number;
  error: string | null;
  updateInfo: UpdateInfo | null;
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({
    checking: false,
    available: false,
    downloading: false,
    progress: 0,
    error: null,
    updateInfo: null,
  });
  const [update, setUpdate] = useState<Update | null>(null);

  const checkForUpdates = useCallback(async () => {
    setState((prev) => ({ ...prev, checking: true, error: null }));

    try {
      const updateResult = await check();

      if (updateResult) {
        setUpdate(updateResult);
        setState((prev) => ({
          ...prev,
          checking: false,
          available: true,
          updateInfo: {
            version: updateResult.version,
            currentVersion: updateResult.currentVersion,
            body: updateResult.body || undefined,
            date: updateResult.date || undefined,
          },
        }));
        return true;
      } else {
        setState((prev) => ({
          ...prev,
          checking: false,
          available: false,
          updateInfo: null,
        }));
        return false;
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        checking: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to check for updates",
      }));
      return false;
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!update) return;

    setState((prev) => ({
      ...prev,
      downloading: true,
      progress: 0,
      error: null,
    }));

    let downloadedBytes = 0;
    let totalBytes = 0;

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            totalBytes =
              (event.data as { contentLength?: number }).contentLength || 0;
            downloadedBytes = 0;
            setState((prev) => ({ ...prev, progress: 0 }));
            break;
          case "Progress":
            downloadedBytes += (event.data as { chunkLength: number })
              .chunkLength;
            const progress =
              totalBytes > 0
                ? Math.round((downloadedBytes / totalBytes) * 100)
                : 0;
            setState((prev) => ({
              ...prev,
              progress: Math.min(progress, 100),
            }));
            break;
          case "Finished":
            setState((prev) => ({ ...prev, progress: 100 }));
            break;
        }
      });

      // Relaunch the app after successful installation
      await relaunch();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        downloading: false,
        error:
          error instanceof Error ? error.message : "Failed to download update",
      }));
    }
  }, [update]);

  const dismissUpdate = useCallback(() => {
    setState((prev) => ({
      ...prev,
      available: false,
      updateInfo: null,
    }));
    setUpdate(null);
  }, []);

  return {
    ...state,
    checkForUpdates,
    downloadAndInstall,
    dismissUpdate,
  };
}
