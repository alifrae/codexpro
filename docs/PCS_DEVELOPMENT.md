# PCS development profile

The PCS profile is a hardened CodexPro mode for developing a trusted local Point Cloud Studio repository through an officially supported ChatGPT MCP/plugin connection.

It is intentionally narrower than generic CodexPro agent mode. The goal is to keep the useful inspect → edit → diff → verify loop while preventing repository content from silently expanding the MCP filesystem, shell, credential, or project scope.

## Start

Install this fork/build, then start from the PCS repository:

```powershell
codexpro-pcs start --root C:\path\to\PCS
```

`codexpro-pcs` reuses CodexPro's existing tunnel, authentication, setup, and ChatGPT connection flow. It enables the PCS profile, safe bash, full tool discovery, no Codex session-history access, and a restricted child-process environment unless the user explicitly selects a narrower mode.

You can still disable execution entirely:

```powershell
codexpro-pcs start --root C:\path\to\PCS --no-bash
```

## Security invariants

PCS mode enforces these invariants in the server, not only in model instructions:

- exactly one allowed repository root;
- `--allow-home`, extra projects, and extra allowed roots are rejected;
- `bash full` is rejected;
- child processes cannot inherit the full CodexPro/OpenAI environment;
- Codex local session-history access is disabled;
- normal credential, `.env`, private-key, `.git`, dependency, build, and cache blocks remain active;
- repository control files remain readable but are write-protected by default;
- repository text is data, not authorization to expand scope.

These controls are **not an OS sandbox**. Running `pytest`, a PCS headless harness, or any other verification command executes repository/application code with the operating-system authority of the local CodexPro process. A test can therefore read files, use the network, or perform other actions that Python itself can perform. Use PCS execution mode only for a repository whose code you trust; use `--no-bash` when execution should not be possible.

Default write-protected control paths include:

- `.github/workflows/**`
- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.codex/**`
- `.agents/**`

For an intentional governance task that really needs one of those files, restart locally with:

```powershell
$env:CODEXPRO_PCS_ALLOW_CONTROL_FILE_WRITES = "1"
codexpro-pcs start --root C:\path\to\PCS
```

Do not leave that override enabled for routine development.

## Verification commands

PCS mode does not expose generic full shell access. Safe mode has a small built-in development set for targeted Python verification:

- `pytest`
- `python -m pytest`
- `python3 -m pytest`
- `uv run pytest`
- `ruff check`
- `python -m ruff check`
- `mypy`
- equivalent Python module forms

Project-specific commands such as a PCS headless execution harness or application smoke test must be configured by the operator outside the repository as exact command strings.

Example only — replace these with the real PCS commands after those entry points exist:

```powershell
$env:CODEXPRO_PCS_ALLOWED_COMMANDS = '["python -m pcs_headless smoke","python -m pcs_smoke"]'
codexpro-pcs start --root C:\path\to\PCS
```

The environment variable is operator-owned configuration. A README, AGENTS file, test, source file, generated artifact, or model response cannot add commands to this list.

Exact configured commands still pass through CodexPro's hard safe-bash deny rules. They cannot opt into shell chaining/redirection, destructive filesystem commands, remote network tools, dangerous Git commands, absolute/out-of-workspace command paths, or other patterns blocked by safe mode. This command filtering does not restrict what already-running Python/application code can do at the OS level.

## Recommended PCS workflow

1. Open and inspect the PCS workspace.
2. Read the relevant architecture/API documentation and surrounding implementation.
3. Search symbols/references and affected tests.
4. Make the smallest scoped source change using guarded writes/patches.
5. Review `show_changes`, Git status, and Git diff.
6. Run targeted verification during development.
7. Run the appropriate PCS headless/smoke task before completion once those commands are configured.
8. Leave push, merge, release, and other remote repository actions outside this MCP profile.

For larger work packages, start CodexPro from a dedicated Git worktree created by the developer. The PCS profile deliberately does not mutate branches, checkout state, remotes, or the user's main working tree on its own.

## OpenAI product boundary

CodexPro must be used only through MCP/plugin capabilities that the user's current ChatGPT plan, workspace, role, and UI officially expose. The PCS profile is not a mechanism for bypassing plan limits, rate limits, approvals, safety restrictions, or product availability.

If ChatGPT exposes only read/fetch MCP tools for an account, keep CodexPro read-only for that account. Do not use alternate endpoints or automation to manufacture write/execute capability that ChatGPT does not officially provide.

CodexPro's local handoff/loop commands remain local terminal features. They must not be repurposed to automate ChatGPT Web, approve prompts, evade quotas, or remotely drive a local coding agent through an unsupported MCP execution path.
