# Using CodexPro with Point Cloud Studio

This tutorial describes the intended PCS workflow after introducing separate safe and development execution modes.

```text
ChatGPT Web
    ↓ MCP
codexpro-pcs
    ↓
dedicated PCS worktree
    ↓
read/search/edit/execute/diff/verify
```

Use **safe mode by default**. Switch to **dev mode** only when the task genuinely needs open-ended execution.

## 1. Understand the two boundaries

CodexPro PCS has two different kinds of confinement:

1. MCP file tools are restricted to one selected PCS worktree.
2. Executed programs are ordinary local processes, not sandboxed processes.

`read`, `search`, `write`, `edit`, and `apply_patch` are path-guarded. A Python program launched in dev mode runs with your normal OS user permissions and can use Python APIs beyond the MCP root. Do not enable dev mode for untrusted code.

## 2. Prerequisites

Install on the PCS machine:

- Git;
- Node.js 20+;
- this CodexPro fork/branch;
- the PCS Python/runtime dependencies needed for the task;
- a ChatGPT account/workspace that officially exposes custom MCP/plugin support.

Run CodexPro as a normal developer user, not Administrator/root.

## 3. Get the PCS-enabled branch

```powershell
git clone https://github.com/alifrae/codexpro.git
cd codexpro
git fetch origin
git switch feat/pcs-dev-profile
npm install
npm run build
```

If using a global link/install, confirm that `codexpro-pcs` resolves to this checkout.

## 4. Create a dedicated PCS worktree

For implementation or debugging, do not share the same mutable checkout with Codex, Gemini, or manual work.

```powershell
cd C:\path\to\PCS
git status
git worktree add ..\PCS-chatgpt -b feat\chatgpt-task
```

Use `C:\path\to\PCS-chatgpt` as the CodexPro root.

## 5. Start with safe read-only analysis

For architecture review, API audits, impact analysis, planning, and code reading:

```powershell
codexpro-pcs start --root C:\path\to\PCS-chatgpt --pcs-mode safe --no-bash --write off
```

A good first request is:

```text
Inspect the current PCS workspace. Read AGENTS.md and the relevant architecture/API documentation, inspect the current Git status and affected code/tests, and summarize the implementation area. Do not modify anything yet.
```

Confirm that the reported workspace is the dedicated worktree you intended to expose.

## 6. Enable guarded MCP writes

For edits that do not require executing code:

```powershell
codexpro-pcs start --root C:\path\to\PCS-chatgpt --pcs-mode safe --no-bash --write workspace
```

Normal source files can be changed. Governance/control files remain MCP write-protected by default.

For a deliberate governance task only:

```powershell
$env:CODEXPRO_PCS_ALLOW_CONTROL_FILE_WRITES = "1"
codexpro-pcs start --root C:\path\to\PCS-chatgpt --pcs-mode safe --no-bash --write workspace
```

Remove the override afterwards:

```powershell
Remove-Item Env:CODEXPRO_PCS_ALLOW_CONTROL_FILE_WRITES
```

## 7. Use safe execution for known verification

For a normal change whose tests are already known:

```powershell
codexpro-pcs start --root C:\path\to\PCS-chatgpt --pcs-mode safe --write workspace
```

Built-in safe checks include targeted pytest, Ruff, and mypy invocations.

For PCS-specific verification, define exact operator-owned commands outside the repository:

```powershell
$env:CODEXPRO_PCS_ALLOWED_COMMANDS = '["python -m pcs.headless smoke","python -m pcs.gonogo --scope agent"]'
codexpro-pcs start --root C:\path\to\PCS-chatgpt --pcs-mode safe --write workspace
```

Those command names are examples until PCS freezes the real canonical headless/smoke/Go-NoGo entry points. Repository content cannot add itself to this allowlist.

## 8. Switch to dev mode for real debugging

Use dev mode when the task is exploratory, for example:

- reproduce a GUI/runtime freeze with a headless or scripted path;
- create and run a temporary diagnostic Python script;
- inspect dynamic metadata or generated output;
- run PCS/application entry points;
- use `git blame`, `git log`, or `git bisect` during root-cause analysis;
- execute a local profiler or project utility;
- iterate on an unknown bug where the necessary commands cannot be predicted in advance.

Start:

```powershell
codexpro-pcs start --root C:\path\to\PCS-chatgpt --pcs-mode dev
```

Dev mode requires execution and workspace writes because arbitrary development commands can modify the checkout regardless of MCP `write` tool settings.

The agent can now run broad local commands such as project scripts or one-off Python/Node probes without pre-registering every exact string.

## 9. What dev mode still blocks

CodexPro rejects obvious commands that would expand authority beyond normal local development, including:

- `git push`, pull/fetch/clone, merge/rebase/submodule operations;
- `curl`, `wget`, SSH/SCP and similar remote clients;
- `gh`, cloud/deployment CLIs;
- package install/update/publish commands;
- release publication commands;
- destructive clean/reset-hard/path restore operations;
- direct parent/home/absolute path escapes;
- obvious credential/control-file path references;
- privilege/process-management commands.

This is intentional. ChatGPT gets enough execution authority to debug PCS, but CodexPro is not meant to become a release/deployment shell.

## 10. Credential isolation in dev mode

Executed PCS commands receive a restricted environment rather than your full terminal environment.

PCS execution also uses an isolated temporary HOME/profile. Normal Git global/system credential discovery and interactive prompting are disabled, and common npm/pip user configuration is redirected away from your real profile.

This reduces accidental leakage of tokens and credentials. It does **not** make arbitrary application code safe. A program running under your OS account can still call filesystem/network APIs directly.

## 11. Example: complex PCS bug workflow

Suppose the task is:

```text
PCS freezes when switching mirror coloring after repeated playback. Find the root cause, implement the smallest fix, and add a regression test.
```

A useful workflow is:

1. Start safe/read-only and inspect the rendering/coloring code, state transitions, existing tests, and known invariants.
2. If static inspection is insufficient, restart the same worktree with `--pcs-mode dev`.
3. Reproduce through the least expensive available path: targeted test, headless harness, or diagnostic script.
4. Add temporary instrumentation/probes if needed.
5. Form a concrete root-cause hypothesis and test it.
6. Implement the smallest compatible change.
7. Add a regression test that fails on the old behavior.
8. Run targeted tests during iteration.
9. Run the canonical PCS smoke/headless/Go-NoGo subset once available.
10. Review Git status and the full diff.
11. Report root cause, changed files, verification, and remaining risk.

This is the class of task for which dev mode exists.

## 12. Example: PCS API audit

An API audit usually does not need dev mode.

```powershell
codexpro-pcs start --root C:\path\to\PCS-chatgpt --pcs-mode safe --no-bash --write off
```

Ask ChatGPT to trace public API entry points, implementations, tests, callers, and missing semantic surfaces. Only enable writes after the audit is understood. Only enable execution when verification requires it.

## 13. Do not confuse command filtering with sandboxing

A shell command can be blocked when its text says `curl`, `../`, or `git push`. But `python diagnostic.py` can itself import `socket`, `subprocess`, or filesystem APIs.

If you require strong containment of executed code, use Docker/containerization where allowed, a VM, a dedicated restricted user, or another OS sandbox. Keep CodexPro's policy explicit rather than pretending command filtering provides process isolation.

## 14. Sensitive recordings and customer data

Do not place production/customer recordings, credentials, private keys, signing material, or confidential exports into the agent worktree merely for convenience.

Prefer curated minimal fixtures. The path guard can enforce location; it cannot classify the confidentiality of arbitrary `.pcap`, `.dat`, `.parquet`, calibration, or metadata files.

## 15. Finish a task safely

Before accepting a change, require ChatGPT to:

1. show Git status;
2. inspect the final diff;
3. list every modified file;
4. state each command/check actually run;
5. distinguish passed checks from checks not run;
6. run the relevant PCS headless/smoke/Go-NoGo verification when available;
7. state remaining risks or unverified behavior.

Then stop CodexPro/the tunnel. Push, pull-request creation, merge, signing, release, and deployment stay in your normal developer/GitHub workflow.

## 16. Recommended mode table

| Work | Command |
| --- | --- |
| Architecture/API audit | `codexpro-pcs start --root <PCS> --pcs-mode safe --no-bash --write off` |
| Review/impact analysis | same as above |
| Editing only | `codexpro-pcs start --root <PCS> --pcs-mode safe --no-bash --write workspace` |
| Straightforward fix + known tests | `codexpro-pcs start --root <PCS> --pcs-mode safe --write workspace` |
| Complex debugging/feature development | `codexpro-pcs start --root <PCS> --pcs-mode dev` |
| Untrusted code | do not use dev mode without an OS sandbox |

## 17. Troubleshooting

### `--pcs-mode dev` is rejected with `--no-bash`

Expected. Dev mode is specifically the broad execution mode. Use safe mode when execution should be off.

### A safe-mode command is rejected

Use an existing built-in verification command, add one exact operator-owned PCS verification string, or decide explicitly that the task requires dev mode. Do not use generic `--bash full`.

### A dev-mode command is blocked

Check whether it is trying to perform network/remote Git/package-install/release/path-escape/control-file activity. Those remain intentionally outside the dev boundary. Run such administrative/integration steps manually when genuinely required.

### A PCS script needs a token or user configuration

Do not solve this by enabling full environment inheritance. Prefer a purpose-built least-privilege test input or run that integration manually outside CodexPro.

### ChatGPT can read but not write

Confirm `--write workspace` and verify that the target is not a protected governance/control path.

### ChatGPT cannot reach CodexPro

Run:

```powershell
codexpro connection-test
```

Confirm the server is running and the tunnel URL/token are current.
