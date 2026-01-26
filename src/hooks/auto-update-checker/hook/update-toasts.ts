import type { PluginInput } from "@opencode-ai/plugin"
import { log } from "../../../shared/logger"

export async function showUpdateAvailableToast(
  ctx: PluginInput,
  latestVersion: string,
  getToastMessage: (isUpdate: boolean, latestVersion?: string) => string
): Promise<void> {
  await ctx.client.tui
    .showToast({
      body: {
        title: `OhMyOpenCode ${latestVersion}`,
        message: getToastMessage(true, latestVersion),
        variant: "info" as const,
        duration: 8000,
      },
    })
    .catch(() => {})
  log(`[auto-update-checker] Update available toast shown: v${latestVersion}`)
}

export async function showAutoUpdatedToast(ctx: PluginInput, oldVersion: string, newVersion: string): Promise<void> {
  await ctx.client.tui
    .showToast({
      body: {
        title: "OhMyOpenCode 已更新！",
        message: `v${oldVersion} → v${newVersion}\n请重启 OpenCode 生效。`,
        variant: "success" as const,
        duration: 8000,
      },
    })
    .catch(() => {})
  log(`[auto-update-checker] Auto-updated toast shown: v${oldVersion} → v${newVersion}`)
}
