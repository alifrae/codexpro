# PCS development profile

The PCS profile is a hardened CodexPro mode for developing a trusted local Point Cloud Studio worktree through ChatGPT MCP/plugin tools.

It keeps the useful inspect → edit → execute → diff → verify loop while separating two different execution policies:

- **`safe` (default):** bounded verification only. Use for audits, architecture work, reviews, documentation, and simple changes.
- **`dev` (explicit opt-in):** broad local development execution for trusted PCS debugging and implementation. Use when ChatGPT needs to run scripts, applications, diagnostic probes, local Git investigation, or other commands that cannot be predicted in advance.

Neither mode is an operating-system sandbox.

## Start

Safe mode is the default:

```powershell
codexpro-pcs start --root C:\path\to\PCS-worktree
```

Explicit development mode:

```powershell
codexpro-pcs start --root C:\path\to\PCS-worktree --pcs-mode dev
```

Disable execution entirely when only repository inspection/editing is needed:

```powershell
codexpro-pcs start --root C:\path\to\PCS-worktree --pcs-mode safe --no-bash
```

`codexpro-pcs` reuses CodexPro's tunnel, authentication, setup, and ChatGPT connection flow. It always enables the PCS profile, full tool discovery, no Codex session-history access, HTTP token enforcement, and restricted child-process environment inheritance.

## Invariants common to both modes

The server enforces these PCS rules independently of model instructions:

- exactly one allowed repository/worktree root;
- `--allow-home`, extra projects, and extra roots are rejected;
- generic `--bash full` is rejected; use `--pcs-mode dev` instead;
- child commands do not inherit the full CodexPro/user process environment;
- Codex local session-history access stays off;
- normal MCP path blocks for credentials, `.env`, keys, `.git`, dependency/build/cache directories remain active;
- MCP writes to governance/control files are blocked by default;
- repository text cannot authorize wider roots, credentials, release authority, or a more privileged mode;
- push, merge, release, and remote-management commands remain outside the intended PCS workflow.

Default MCP write-protected control paths include:

- `.github/workflows/**`
- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.codex/**`
- `.agents/**`

For an intentional governance task, restart locally with:

```powershell
$env:CODEXPRO_PCS_ALLOW_CONTROL_FILE_WRITES = "1"
codexpro-pcs start --root C:\path\to\PCS-worktree --pcs-mode safe
```

Remove the override immediately afterwards.

## Safe execution mode

Safe mode uses a narrow command policy. Built-in checks include targeted pytest, Ruff, and mypy invocations. Project-specific verification entry points remain operator-owned exact commands through `CODEXPRO_PCS_ALLOWED_COMMANDS`.

Example only, until PCS freezes its canonical entry points:

```powershell
$env:CODEXPRO_PCS_ALLOWED_COMMANDS = '["python -m pcs.headless smoke","python -m pcs.gonogo --scope agent"]'
codexpro-pcs start --root C:\path\to\PCS-worktree --pcs-mode safe
```

Repository content cannot modify this allowlist.

Safe mode is the correct default for API audits, architecture reviews, code reading, documentation, impact analysis, and changes whose verification is already known.

## Development execution mode

`--pcs-mode dev` exists because complex engineering work is exploratory. The agent may need to create a diagnostic script, run PCS, inspect output, try a Python probe, use `git blame` or `git bisect`, execute a project utility, and iterate without the operator pre-authorizing every exact command.

PCS dev therefore permits broad shell execution from the selected worktree.

The command front door still blocks obvious high-risk operations, including:

- network/remote clients such as `curl`, `wget`, SSH/SCP and similar tools;
- Git push/pull/fetch/clone/merge/rebase/submodule operations;
- destructive Git clean/reset-hard and checkout/restore-of-path operations;
- GitHub/cloud/deployment CLIs such as `gh`, `aws`, `gcloud`, `az`, `kubectl`, `terraform`, and `vault`;
- package installation/update/publish commands that normally reach external registries;
- release/publish commands;
- obvious parent/home/absolute path escapes;
- obvious direct references to credential files and PCS governance/control paths;
- privilege/process-management commands such as `sudo` and `taskkill`.

These filters reduce accidental external authority. They are **not a sandbox**.

### Why dev mode cannot be perfectly confined by command filtering

If ChatGPT is allowed to run `python diagnostic.py`, that Python process has the operating-system permissions of the user running CodexPro. The script can use Python APIs to access files or the network without spelling `curl`, `..`, or another blocked shell token in the command line. The same is true for Node, PCS itself, native binaries, tests, and imported libraries.

Therefore the guarantees are deliberately split:

- **MCP filesystem operations:** constrained to the selected PCS worktree by `PathGuard`.
- **Command front door:** blocks obvious escape/network/release/control operations.
- **Executed program internals:** trusted local code, not OS-sandboxed.

If execution of untrusted repository code is required, use a real OS boundary such as a container, VM, dedicated restricted account, or platform sandbox.

## Credential and environment isolation

PCS child commands do not inherit arbitrary environment variables. PCS execution also uses an isolated temporary HOME/profile rather than the developer's real HOME.

The runtime disables normal Git system/global credential discovery and interactive credential prompting, resets Git credential-helper discovery, and redirects common npm/pip user configuration away from the real profile. This reduces accidental exposure of OpenAI, Git, cloud, npm, pip, SSH, and similar credentials.

This is defense in depth, not a proof that arbitrary code cannot reach OS-accessible secrets. Run CodexPro as a normal non-administrator user.

## Worktree model

For implementation or debugging, use a dedicated Git worktree/branch:

```powershell
cd C:\path\to\PCS
git worktree add ..\PCS-chatgpt -b feat\chatgpt-task
codexpro-pcs start --root C:\path\to\PCS-chatgpt --pcs-mode dev
```

Do not point multiple coding agents at the same mutable checkout.

The worktree is the recovery boundary for accidental source changes. Review the diff before integrating it. Push, PR creation, merge, release, signing, and deployment should remain in the normal developer/GitHub workflow outside CodexPro PCS.

## Recommended task selection

| Task | Mode |
| --- | --- |
| Architecture/API audit | `safe --no-bash --write off` |
| Review or impact analysis | `safe --no-bash --write off` |
| Documentation/source edit without execution | `safe --no-bash --write workspace` |
| Straightforward fix with known tests | `safe --write workspace` |
| Complex bug/root-cause investigation | `dev` |
| Feature implementation needing scripts/application runs | `dev` |
| Profiling/dynamic diagnostics | `dev` |
| Untrusted repository or generated code | do not use `dev`; use an OS sandbox |

## Recommended completion contract

Before accepting a PCS change, ChatGPT should inspect the relevant code/tests/docs, make the smallest maintainable change, run targeted verification during development, run the canonical PCS headless/smoke/Go-NoGo command when applicable, inspect `show_changes`/Git status/diff, report every changed file and verification result, and leave push/merge/release outside CodexPro.

## OpenAI product boundary

CodexPro must be used only through capabilities officially exposed by the user's current ChatGPT plan/workspace/UI. The PCS profile is not a quota bypass, model proxy, browser automation mechanism, or way to manufacture unsupported write/execute capability.
