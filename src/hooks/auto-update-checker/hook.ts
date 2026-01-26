import type { PluginInput } from "@opencode-ai/plugin"
import { log } from "../../shared/logger"
import { getCachedVersion, getLocalDevVersion } from "./checker"
import type { AutoUpdateCheckerOptions } from "./types"
import { runBackgroundUpdateCheck } from "./hook/background-update-check"
import { showConfigErrorsIfAny } from "./hook/config-errors-toast"
import { updateAndShowConnectedProvidersCacheStatus } from "./hook/connected-providers-status"
import { showModelCacheWarningIfNeeded } from "./hook/model-cache-warning"
import { showLocalDevToast, showVersionToast } from "./hook/startup-toasts"

export function createAutoUpdateCheckerHook(ctx: PluginInput, options: AutoUpdateCheckerOptions = {}) {
  const { showStartupToast = true, isSisyphusEnabled = false, autoUpdate = true } = options

  const getToastMessage = (isUpdate: boolean, latestVersion?: string): string => {
    if (isSisyphusEnabled) {
      return isUpdate
        ? `强化版 Sisyphus 正在掌舵 OpenCode。\nv${latestVersion} 可用，重启以生效。`
        : "强化版 Sisyphus 正在掌舵 OpenCode。"
    }
    return isUpdate
      ? `OpenCode 已进入增强模式。oMoMoMoMo...\nv${latestVersion} 可用，重启 OpenCode 生效。`
      : "OpenCode 已进入增强模式。oMoMoMoMo..."
  }

  let hasChecked = false

  return {
    event: ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== "session.created") return
      if (hasChecked) return

      const props = event.properties as { info?: { parentID?: string } } | undefined
      if (props?.info?.parentID) return

      hasChecked = true

      setTimeout(async () => {
        const cachedVersion = getCachedVersion()
        const localDevVersion = getLocalDevVersion(ctx.directory)
        const displayVersion = localDevVersion ?? cachedVersion

        await showConfigErrorsIfAny(ctx)
        await showModelCacheWarningIfNeeded(ctx)
        await updateAndShowConnectedProvidersCacheStatus(ctx)

        if (localDevVersion) {
          if (showStartupToast) {
            showLocalDevToast(ctx, displayVersion, isSisyphusEnabled).catch(() => {})
          }
          log("[auto-update-checker] Local development mode")
          return
        }

        if (showStartupToast) {
          showVersionToast(ctx, displayVersion, getToastMessage(false)).catch(() => {})
        }

        runBackgroundUpdateCheck(ctx, autoUpdate, getToastMessage).catch((err) => {
          log("[auto-update-checker] Background update check failed:", err)
        })
      }, 0)
    },
  }
}
