import { useCallback, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";

export type UpdaterPhase =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available"; update: Update; version: string }
  | { phase: "downloading"; percent: number | null }
  | { phase: "done" }
  | { phase: "up-to-date" }
  | { phase: "error"; message: string };

export function useUpdater() {
  const [state, setState] = useState<UpdaterPhase>({ phase: "idle" });

  const applyUpdate = useCallback(async (update: Update) => {
    toast.dismiss("upd-available");
    setState({ phase: "downloading", percent: null });

    let downloaded = 0;
    let total: number | null = null;

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          toast.loading("Downloading update…", { id: "upd-progress" });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const pct = total ? Math.round((downloaded / total) * 100) : null;
          setState({ phase: "downloading", percent: pct });
          toast.loading(
            pct !== null ? `Downloading update (${pct}%)` : "Downloading update…",
            { id: "upd-progress" }
          );
        } else if (event.event === "Finished") {
          toast.dismiss("upd-progress");
        }
      });
      setState({ phase: "done" });
      toast.success("Update downloaded — the app will close and relaunch to finish installing.");
    } catch (e) {
      toast.dismiss("upd-progress");
      const message = e instanceof Error ? e.message : String(e);
      setState({ phase: "error", message });
      toast.error(`Update failed: ${message}`);
      setTimeout(() => setState({ phase: "idle" }), 3000);
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    // Close any existing Update resource before starting a new check
    setState((prev) => {
      if (prev.phase === "available") {
        prev.update.close().catch(() => {});
      }
      return { phase: "checking" };
    });
    try {
      const update = await check();
      if (!update) {
        setState({ phase: "up-to-date" });
        toast.success("You're on the latest version.");
        setTimeout(() => setState({ phase: "idle" }), 2000);
        return;
      }
      setState({ phase: "available", update, version: update.version });
      toast.info(`Update v${update.version} is available`, {
        id: "upd-available",
        duration: Infinity,
        action: {
          label: "Install",
          onClick: () => applyUpdate(update),
        },
        cancel: {
          label: "Later",
          onClick: () => {
            update.close().catch(() => {});
            setState({ phase: "idle" });
          },
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ phase: "error", message });
      toast.error(`Update check failed: ${message}`);
      setTimeout(() => setState({ phase: "idle" }), 3000);
    }
  }, [applyUpdate]);

  return { state, checkForUpdates };
}
