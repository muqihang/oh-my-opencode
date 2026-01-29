#!/usr/bin/env bun
import { existsSync } from 'node:fs';

type ReportFormat = 'md' | 'json';

export interface ZhDiffOptions {
  baseRef: string;
  headRef: string;
  path: string;
  format: ReportFormat;
  includeTests: boolean;
}

export interface UntranslatedStringFinding {
  filePath: string;
  line: number;
  rawLine: string;
  text: string;
}

export interface ZhDiffReport {
  baseRef: string;
  headRef: string;
  path: string;
  findings: UntranslatedStringFinding[];
}

function parseArgs(argv: string[]): Partial<ZhDiffOptions> {
  const result: Partial<ZhDiffOptions> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--base') {
      const value = argv[i + 1];
      if (value) result.baseRef = value;
      i += 1;
      continue;
    }

    if (arg === '--head') {
      const value = argv[i + 1];
      if (value) result.headRef = value;
      i += 1;
      continue;
    }

    if (arg === '--path') {
      const value = argv[i + 1];
      if (value) result.path = value;
      i += 1;
      continue;
    }

    if (arg === '--format') {
      const value = argv[i + 1] as ReportFormat | undefined;
      if (value === 'md' || value === 'json') result.format = value;
      i += 1;
      continue;
    }

    if (arg === '--include-tests') {
      result.includeTests = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      // handled by main
      continue;
    }
  }

  return result;
}

function printHelp(): void {
  // Keep help short; users can pipe to a file if needed.
  // NOTE: We intentionally do not write files in this script.
  const lines = [
    'Usage:',
    '  bun run zh:diff [--base <ref>] [--head <ref>] [--path <path>] [--format md|json] [--include-tests]',
    '',
    'Typical (after merging dev into feature):',
    '  bun run zh:diff',
    '',
    'Explicit comparison:',
    '  bun run zh:diff --base <oldFeatureCommit> --head HEAD --path src',
    '',
    'Output formats:',
    '  --format md   (default) human-readable markdown',
    '  --format json machine-readable JSON',
  ];
  console.log(lines.join('\n'));
}

function runGit(args: string[]): string {
  const proc = Bun.spawnSync(['git', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const stdout = Buffer.from(proc.stdout).toString('utf-8');
  const stderr = Buffer.from(proc.stderr).toString('utf-8');

  if (proc.exitCode !== 0) {
    const message = stderr.trim().length > 0 ? stderr.trim() : `git ${args.join(' ')} failed`;
    throw new Error(message);
  }

  return stdout;
}

function isLikelyIdentifier(text: string): boolean {
  // Avoid reporting protocol/event IDs like "session.idle", "tool.execute",
  // and other non-user-facing keys.
  return /^[A-Za-z0-9_.:/-]+$/.test(text) && !text.includes(' ');
}

function containsHan(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function shouldIgnoreFile(filePath: string, includeTests: boolean): boolean {
  if (filePath.includes('/__snapshots__/')) return true;
  if (filePath.endsWith('.snap')) return true;

  if (!includeTests) {
    if (filePath.endsWith('.test.ts')) return true;
    if (filePath.endsWith('.spec.ts')) return true;
    if (filePath.endsWith('.property.test.ts')) return true;
    if (filePath.endsWith('.integration.test.ts')) return true;
  }

  return false;
}

function shouldIgnoreLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('import ')) return true;
  if (trimmed.startsWith('export ') && trimmed.includes(' from ')) return true;
  if (trimmed.startsWith('#')) return true; // markdown headings
  return false;
}

function extractStringLiterals(line: string): string[] {
  const results: string[] = [];

  const patterns: RegExp[] = [
    /"([^"\\]|\\.)*"/g,
    /'([^'\\]|\\.)*'/g,
    /`([^`\\]|\\.)*`/g,
  ];

  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      const raw = match[0];
      const unquoted = raw.length >= 2 ? raw.slice(1, -1) : raw;
      results.push(unquoted);
    }
  }

  return results;
}

export function extractUntranslatedStringsFromDiff(
  diff: string,
  options: Pick<ZhDiffOptions, 'includeTests'>,
): UntranslatedStringFinding[] {
  let currentFilePath: string | null = null;
  let currentNewLine = 0;

  const findings: UntranslatedStringFinding[] = [];

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFilePath = line.slice('+++ b/'.length).trim();
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      currentNewLine = Number.parseInt(hunkMatch[1], 10);
      continue;
    }

    if (!currentFilePath) continue;
    if (shouldIgnoreFile(currentFilePath, options.includeTests)) continue;

    // Added lines: start with '+' but not the '+++ b/...' header.
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const rawLine = line.slice(1);

      if (!shouldIgnoreLine(rawLine)) {
        for (const literal of extractStringLiterals(rawLine)) {
          if (!/[A-Za-z]/.test(literal)) continue;
          if (containsHan(literal)) continue;
          if (isLikelyIdentifier(literal)) continue;

          const trimmed = literal.trim();
          if (trimmed.length === 0) continue;

          findings.push({
            filePath: currentFilePath,
            line: currentNewLine,
            rawLine: rawLine.trim(),
            text: trimmed,
          });
        }
      }

      currentNewLine += 1;
      continue;
    }

    // Context lines (rare with -U0, but keep correct accounting if present).
    if (line.startsWith(' ')) {
      currentNewLine += 1;
      continue;
    }

    // Deletions do not advance the "new file" line counter.
  }

  // De-duplicate identical entries (same file + line + text).
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.filePath}:${f.line}:${f.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectDefaultBaseRef(headRef: string): string | null {
  // If HEAD is a merge commit, default to first parent so the diff shows
  // what changed "because of the merge".
  try {
    const parentsLine = runGit(['rev-list', '--parents', '-n', '1', headRef]).trim();
    const parts = parentsLine.split(/\s+/).filter(Boolean);
    if (parts.length >= 3) {
      return parts[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function buildMarkdown(report: ZhDiffReport): string {
  const lines: string[] = [];
  lines.push('# 汉化差异扫描报告');
  lines.push('');
  lines.push(`- base: \`${report.baseRef}\``);
  lines.push(`- head: \`${report.headRef}\``);
  lines.push(`- path: \`${report.path}\``);
  lines.push(`- findings: \`${report.findings.length}\``);
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('未发现需要补充汉化的新增英文字符串。');
    return lines.join('\n');
  }

  const byFile = new Map<string, UntranslatedStringFinding[]>();
  for (const finding of report.findings) {
    const list = byFile.get(finding.filePath) ?? [];
    list.push(finding);
    byFile.set(finding.filePath, list);
  }

  for (const [filePath, items] of byFile) {
    lines.push(`## ${filePath}`);
    for (const item of items) {
      const preview = item.text.length > 120 ? item.text.slice(0, 117) + '...' : item.text;
      lines.push(`- L${item.line}: "${preview}"`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return 0;
  }

  const headRef = parsed.headRef ?? 'HEAD';
  const defaultBase = detectDefaultBaseRef(headRef);
  const baseRef = parsed.baseRef ?? defaultBase;

  if (!baseRef) {
    console.error('Error: --base not provided and HEAD is not a merge commit.');
    console.error('Hint: run this right after merging dev into feature, or pass --base <ref>.');
    return 2;
  }

  const options: ZhDiffOptions = {
    baseRef,
    headRef,
    path: parsed.path ?? 'src',
    format: parsed.format ?? 'md',
    includeTests: parsed.includeTests ?? false,
  };

  // Basic sanity: help the user if they run from wrong directory.
  if (!existsSync('.git')) {
    console.error('Error: this script must be run from inside a git repository.');
    return 2;
  }

  const diff = runGit([
    'diff',
    '--unified=0',
    `${options.baseRef}..${options.headRef}`,
    '--',
    options.path,
  ]);

  const findings = extractUntranslatedStringsFromDiff(diff, { includeTests: options.includeTests });
  const report: ZhDiffReport = {
    baseRef: options.baseRef,
    headRef: options.headRef,
    path: options.path,
    findings,
  };

  if (options.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  console.log(buildMarkdown(report));
  return 0;
}

if (import.meta.main) {
  const exitCode = await main(process.argv.slice(2));
  process.exit(exitCode);
}

