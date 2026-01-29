import { describe, expect, it } from 'bun:test';
import { extractUntranslatedStringsFromDiff } from './zh-diff';

describe('zh-diff', () => {
  it('extracts added English string literals with line numbers', () => {
    const diff = [
      'diff --git a/src/cli/run/runner.ts b/src/cli/run/runner.ts',
      'index 0000000..1111111 100644',
      '--- a/src/cli/run/runner.ts',
      '+++ b/src/cli/run/runner.ts',
      '@@ -0,0 +10,3 @@',
      '+console.log("Starting opencode server...")',
      "+console.error('Failed to create session after all retries')",
      '+const x = "session.idle"',
      '',
    ].join('\n');

    const findings = extractUntranslatedStringsFromDiff(diff, { includeTests: false });
    expect(findings.length).toBe(2);
    expect(findings[0]?.filePath).toBe('src/cli/run/runner.ts');
    expect(findings[0]?.line).toBe(10);
    expect(findings[0]?.text).toContain('Starting opencode server');
    expect(findings[1]?.line).toBe(11);
    expect(findings[1]?.text).toContain('Failed to create session');
  });

  it('skips strings that already contain Chinese', () => {
    const diff = [
      '+++ b/src/x.ts',
      '@@ -1,0 +1,1 @@',
      '+console.log("已达到超时时间，正在中止...")',
      '',
    ].join('\n');

    const findings = extractUntranslatedStringsFromDiff(diff, { includeTests: false });
    expect(findings).toEqual([]);
  });

  it('skips import lines', () => {
    const diff = [
      '+++ b/src/x.ts',
      '@@ -1,0 +1,2 @@',
      '+import pc from "picocolors"',
      '+console.log("Update available")',
      '',
    ].join('\n');

    const findings = extractUntranslatedStringsFromDiff(diff, { includeTests: false });
    expect(findings.length).toBe(1);
    expect(findings[0]?.text).toBe('Update available');
  });

  it('skips test files by default', () => {
    const diff = [
      '+++ b/src/x.test.ts',
      '@@ -1,0 +1,1 @@',
      '+console.log("Update available")',
      '',
    ].join('\n');

    const findings = extractUntranslatedStringsFromDiff(diff, { includeTests: false });
    expect(findings).toEqual([]);
  });
});

