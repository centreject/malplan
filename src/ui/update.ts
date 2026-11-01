import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useState } from "react";
import { report } from "./report";

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "latest" }
  | { phase: "available"; update: Update }
  | { phase: "installing"; percent: number | undefined }
  | { phase: "failed"; message: string };

/** Checks GitHub Releases for a newer signed build and installs it (the installer closes and reopens the app). */
export function useUpdate() {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });

  const find = useCallback(async () => {
    if (!isTauri()) {
      return;
    }

    setState({ phase: "checking" });

    try {
      const update = await check();

      setState(update === null ? { phase: "latest" } : { phase: "available", update });
    } catch (error) {
      report(`update check failed: ${String(error)}`);
      setState({ phase: "failed", message: "업데이트를 확인하지 못했습니다. 인터넷 연결을 확인해 주세요." });
    }
  }, []);

  const install = useCallback(async (update: Update) => {
    let total = 0;
    let received = 0;

    setState({ phase: "installing", percent: undefined });

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          setState({ phase: "installing", percent: total > 0 ? Math.round((received / total) * 100) : undefined });
        }
      });
      await relaunch();
    } catch (error) {
      report(`update install failed: ${String(error)}`);
      setState({ phase: "failed", message: "업데이트를 설치하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
  }, []);

  return { state, find, install };
}
