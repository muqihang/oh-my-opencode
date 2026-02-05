# Oh-My-OpenCode × OpenCode Orchestrator Compat (Design)

**Context**: OpenCode base (single-session orchestrator) supports `OPENCODE_ORCHESTRATOR_FORK_STRATEGY=auto|suggest|off`. When `OPENCODE_EXPERIMENTAL_ORCHESTRATOR=1` and the resolved strategy is `auto`, base may auto-dispatch `tool:task` in `orchestratorMode=fork`.

OpenCode base also supports a product-level config (`opencode.json` / `opencode.jsonc`) that influences fork dispatch:
- `product.mode=base|programming|legal` (when mode is not `base`, base defaults to `suggest`)
- `product.forkStrategy=auto|suggest|off` (explicit override)

**Problem**: Oh-My-OpenCode already provides multi-session orchestration/dispatching. If both layers dispatch, users can experience double-delegation (duplicate tasks) or “steering wheel” conflicts.

**Goal**: Add a *minimal-risk* compatibility layer in Oh-My-OpenCode that:
- Keeps default behavior unchanged (compat mode opt-in, default disabled).
- Detects potentially conflicting dispatch configurations (config-first, env fallback).
- Emits a low-frequency, visible warning once per plugin load, recommending `OPENCODE_ORCHESTRATOR_FORK_STRATEGY=suggest` when users want Oh-My-OpenCode to own dispatching.
- Avoids false positives when OpenCode base is already configured to be safe (e.g., `product.mode=programming`).
- Never mutates env at runtime.

## Proposed Design

### 1) Config (opt-in)
Add an experimental config block:

- `experimental.opencode_orchestrator_compat.enabled?: boolean` (default: `false` / missing)

This gates the warning logic and guarantees “no surprises” for existing users.

### 2) Pure compat checker
Introduce a pure function (no side effects) that takes:
- relevant env variables
- an optional snapshot of OpenCode base config (only the minimal stable fields: `product.mode` / `product.forkStrategy`)

and returns:

- `shouldWarn: boolean`
- `message: string`

Rules:
- Warn **only** when `OPENCODE_EXPERIMENTAL_ORCHESTRATOR=1` AND the **resolved** base fork strategy is `auto`.
- The resolution order must match base semantics:
  1) if `product.forkStrategy` is explicitly set: use it
  2) else if `product.mode` is present and not `base`: default to `suggest`
  3) else fall back to `OPENCODE_ORCHESTRATOR_FORK_STRATEGY` (default `auto`)
- Do **not** warn when the resolved strategy is `suggest` or `off`.
- Do **not** warn when experimental orchestrator is off.

### 3) One-time warning location
Call the checker once during plugin initialization (`src/index.ts` entry). Guard with a module-level flag to ensure the message is printed once per process.

Base config loading is best-effort and gated:
- only attempt `ctx.client.config.get()` when compat is enabled
- if config cannot be fetched/parsed, fall back to env-only behavior

### 4) Documentation
Add a small doc section explaining:
- Why `suggest` prevents double-dispatch.
- Recommended (config-first) setup via `product.mode` / `product.forkStrategy`.
- Fallback env setup.
- How to enable Oh-My-OpenCode compat warning.
