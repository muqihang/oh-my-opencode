# Oh-My-OpenCode × OpenCode Orchestrator Compat (Design)

**Context**: OpenCode base (single-session orchestrator) now supports `OPENCODE_ORCHESTRATOR_FORK_STRATEGY=auto|suggest|off`. When `OPENCODE_EXPERIMENTAL_ORCHESTRATOR=1` and strategy is default/`auto`, base may auto-dispatch `tool:task` in `orchestratorMode=fork`.

**Problem**: Oh-My-OpenCode already provides multi-session orchestration/dispatching. If both layers dispatch, users can experience double-delegation (duplicate tasks) or “steering wheel” conflicts.

**Goal**: Add a *minimal-risk* compatibility layer in Oh-My-OpenCode that:
- Keeps default behavior unchanged (compat mode opt-in, default disabled).
- Detects potentially conflicting env combinations.
- Emits a low-frequency, visible warning once per plugin load, recommending `OPENCODE_ORCHESTRATOR_FORK_STRATEGY=suggest` when users want Oh-My-OpenCode to own dispatching.
- Never mutates env at runtime.

## Proposed Design

### 1) Config (opt-in)
Add an experimental config block:

- `experimental.opencode_orchestrator_compat.enabled?: boolean` (default: `false` / missing)

This gates the warning logic and guarantees “no surprises” for existing users.

### 2) Pure compat checker
Introduce a pure function (no side effects) that takes the relevant env variables and returns:

- `shouldWarn: boolean`
- `message: string`

Rules:
- Warn **only** when `OPENCODE_EXPERIMENTAL_ORCHESTRATOR=1` AND fork strategy is missing or `auto`.
- Do **not** warn when strategy is `suggest` or `off`.
- Do **not** warn when experimental orchestrator is off.

### 3) One-time warning location
Call the checker once during plugin initialization (`src/index.ts` entry). Guard with a module-level flag to ensure the message is printed once per process.

### 4) Documentation
Add a small doc section explaining:
- Why `suggest` prevents double-dispatch.
- How to set env vars.
- How to enable Oh-My-OpenCode compat warning.
