import { describe, it, expect, spyOn, afterEach } from "bun:test"
import * as version from "./version"

describe("version check", () => {
  describe("getVersionInfo", () => {
    it("returns version check info structure", async () => {
      // #given
      // #when getting version info
      const info = await version.getVersionInfo()

      // #then should have expected structure
      expect(typeof info.isUpToDate).toBe("boolean")
      expect(typeof info.isLocalDev).toBe("boolean")
      expect(typeof info.isPinned).toBe("boolean")
    })
  })

  describe("checkVersionStatus", () => {
    let getInfoSpy: ReturnType<typeof spyOn>

    afterEach(() => {
      getInfoSpy?.mockRestore()
    })

    it("returns pass when in local dev mode", async () => {
      // #given local dev mode
      getInfoSpy = spyOn(version, "getVersionInfo").mockResolvedValue({
        currentVersion: "local-dev",
        latestVersion: "2.7.0",
        isUpToDate: true,
        isLocalDev: true,
        isPinned: false,
      })

      // #when checking
      const result = await version.checkVersionStatus()

      // #then should pass with dev message
      expect(result.status).toBe("pass")
      expect(result.message).toContain("本地开发模式")
    })

    it("returns pass when pinned", async () => {
      // #given pinned version
      getInfoSpy = spyOn(version, "getVersionInfo").mockResolvedValue({
        currentVersion: "2.6.0",
        latestVersion: "2.7.0",
        isUpToDate: true,
        isLocalDev: false,
        isPinned: true,
      })

      // #when checking
      const result = await version.checkVersionStatus()

      // #then should pass with pinned message
      expect(result.status).toBe("pass")
      expect(result.message).toContain("固定到版本")
    })

    it("returns warn when unable to determine version", async () => {
      // #given no version info
      getInfoSpy = spyOn(version, "getVersionInfo").mockResolvedValue({
        currentVersion: null,
        latestVersion: "2.7.0",
        isUpToDate: false,
        isLocalDev: false,
        isPinned: false,
      })

      // #when checking
      const result = await version.checkVersionStatus()

      // #then should warn
      expect(result.status).toBe("warn")
      expect(result.message).toContain("无法确定")
    })

    it("returns warn when network error", async () => {
      // #given network error
      getInfoSpy = spyOn(version, "getVersionInfo").mockResolvedValue({
        currentVersion: "2.6.0",
        latestVersion: null,
        isUpToDate: true,
        isLocalDev: false,
        isPinned: false,
      })

      // #when checking
      const result = await version.checkVersionStatus()

      // #then should warn
      expect(result.status).toBe("warn")
      expect(result.details?.some((d) => d.includes("网络"))).toBe(true)
    })

    it("returns warn when update available", async () => {
      // #given update available
      getInfoSpy = spyOn(version, "getVersionInfo").mockResolvedValue({
        currentVersion: "2.6.0",
        latestVersion: "2.7.0",
        isUpToDate: false,
        isLocalDev: false,
        isPinned: false,
      })

      // #when checking
      const result = await version.checkVersionStatus()

      // #then should warn with update info
      expect(result.status).toBe("warn")
      expect(result.message).toContain("发现更新")
      expect(result.message).toContain("2.6.0")
      expect(result.message).toContain("2.7.0")
    })

    it("returns pass when up to date", async () => {
      // #given up to date
      getInfoSpy = spyOn(version, "getVersionInfo").mockResolvedValue({
        currentVersion: "2.7.0",
        latestVersion: "2.7.0",
        isUpToDate: true,
        isLocalDev: false,
        isPinned: false,
      })

      // #when checking
      const result = await version.checkVersionStatus()

      // #then should pass
      expect(result.status).toBe("pass")
      expect(result.message).toContain("已是最新")
    })
  })

  describe("getVersionCheckDefinition", () => {
    it("returns valid check definition", () => {
      // #given
      // #when getting definition
      const def = version.getVersionCheckDefinition()

      // #then should have required properties
      expect(def.id).toBe("version-status")
      expect(def.category).toBe("updates")
      expect(def.critical).toBe(false)
    })
  })
})
