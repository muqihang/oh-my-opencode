import { join } from "path"
import { getClaudeConfigDir } from "../../shared"
import { getOpenCodeConfigDir } from "../../shared/opencode-config-dir"
import type { CommandDefinition } from "../claude-code-command-loader/types"
import type { LoadedSkill } from "./types"
import { skillsToCommandDefinitionRecord } from "./skill-definition-record"
import { deduplicateSkillsByName } from "./skill-deduplication"
import { loadSkillsFromDir } from "./skill-directory-loader"

export async function loadUserSkills(): Promise<Record<string, CommandDefinition>> {
  const userSkillsDir = join(getClaudeConfigDir(), "skills")
  const skills = await loadSkillsFromDir({ skillsDir: userSkillsDir, scope: "user" })
  return skillsToCommandDefinitionRecord(skills)
}

export async function loadProjectSkills(cwd: string = process.cwd()): Promise<Record<string, CommandDefinition>> {
  const projectSkillsDir = join(cwd, ".claude", "skills")
  const skills = await loadSkillsFromDir({ skillsDir: projectSkillsDir, scope: "project" })
  return skillsToCommandDefinitionRecord(skills)
}

export async function loadOpencodeGlobalSkills(): Promise<Record<string, CommandDefinition>> {
  const configDir = getOpenCodeConfigDir({ binary: "opencode" })
  const opencodeSkillsDir = join(configDir, "skills")
  const skills = await loadSkillsFromDir({ skillsDir: opencodeSkillsDir, scope: "opencode" })
  return skillsToCommandDefinitionRecord(skills)
}

export async function loadOpencodeProjectSkills(cwd: string = process.cwd()): Promise<Record<string, CommandDefinition>> {
  const opencodeProjectDir = join(cwd, ".opencode", "skills")
  const skills = await loadSkillsFromDir({ skillsDir: opencodeProjectDir, scope: "opencode-project" })
  return skillsToCommandDefinitionRecord(skills)
}

export interface DiscoverSkillsOptions {
  includeClaudeCodePaths?: boolean
  cwd?: string
}

export async function discoverAllSkills(cwd: string = process.cwd()): Promise<LoadedSkill[]> {
  const [opencodeProjectSkills, opencodeGlobalSkills, projectSkills, userSkills] = await Promise.all([
    discoverOpencodeProjectSkills(cwd),
    discoverOpencodeGlobalSkills(),
    discoverProjectClaudeSkills(cwd),
    discoverUserClaudeSkills(),
  ])

  // Priority: opencode-project > opencode > project > user
  return deduplicateSkillsByName([
    ...opencodeProjectSkills,
    ...opencodeGlobalSkills,
    ...projectSkills,
    ...userSkills,
  ])
}

export async function discoverSkills(options: DiscoverSkillsOptions = {}): Promise<LoadedSkill[]> {
  const { includeClaudeCodePaths = true, cwd } = options
  const baseDir = cwd ?? process.cwd()

  const [opencodeProjectSkills, opencodeGlobalSkills] = await Promise.all([
    discoverOpencodeProjectSkills(baseDir),
    discoverOpencodeGlobalSkills(),
  ])

  if (!includeClaudeCodePaths) {
    // Priority: opencode-project > opencode
    return deduplicateSkillsByName([...opencodeProjectSkills, ...opencodeGlobalSkills])
  }

  const [projectSkills, userSkills] = await Promise.all([
    discoverProjectClaudeSkills(baseDir),
    discoverUserClaudeSkills(),
  ])

  // Priority: opencode-project > opencode > project > user
  return deduplicateSkillsByName([
    ...opencodeProjectSkills,
    ...opencodeGlobalSkills,
    ...projectSkills,
    ...userSkills,
  ])
}

export async function getSkillByName(name: string, options: DiscoverSkillsOptions = {}): Promise<LoadedSkill | undefined> {
  const skills = await discoverSkills(options)
  return skills.find((skill) => skill.name === name)
}

export async function discoverUserClaudeSkills(): Promise<LoadedSkill[]> {
  const userSkillsDir = join(getClaudeConfigDir(), "skills")
  return loadSkillsFromDir({ skillsDir: userSkillsDir, scope: "user" })
}

export async function discoverProjectClaudeSkills(cwd: string = process.cwd()): Promise<LoadedSkill[]> {
  const projectSkillsDir = join(cwd, ".claude", "skills")
  return loadSkillsFromDir({ skillsDir: projectSkillsDir, scope: "project" })
}

export async function discoverOpencodeGlobalSkills(): Promise<LoadedSkill[]> {
  const configDir = getOpenCodeConfigDir({ binary: "opencode" })
  const opencodeSkillsDir = join(configDir, "skills")
  return loadSkillsFromDir({ skillsDir: opencodeSkillsDir, scope: "opencode" })
}

export async function discoverOpencodeProjectSkills(cwd: string = process.cwd()): Promise<LoadedSkill[]> {
  const opencodeProjectDir = join(cwd, ".opencode", "skills")
  return loadSkillsFromDir({ skillsDir: opencodeProjectDir, scope: "opencode-project" })
}
