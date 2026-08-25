# Using CodexPro with Point Cloud Studio

This guide describes the recommended way to use the hardened `codexpro-pcs` profile with a local PCS checkout. The goal is to let ChatGPT inspect, edit, diff, and verify PCS while keeping the MCP server constrained to one repository and avoiding generic shell or home-directory access.

## 1. Understand the trust boundary

`codexpro-pcs` is a repository-scoped development bridge, not an operating-system sandbox.

The MCP filesystem is constrained to the PCS repository, and the PCS profile blocks generic `bash full`, extra roots, home-directory exposure, inherited secrets, Codex session history, and writes to selected control files. However, when you explicitly allow a verification command such as `pytest`, the Python code executed by that command still runs with your Windows/Linux user authority.

Use execution mode only with a PCS checkout whose code and dependencies you trust. For review/architecture work, use the read-only/no-execution startup shown below.

## 2. Prerequisites

On the machine containing PCS, install:

- Git;
- Node.js 20 or newer;
- this CodexPro fork/branch;
- the normal PCS Python/runtime dependencies required by the checks you intend to run;
- a ChatGPT account/workspace that officially exposes custom MCP/plugin support.

Do not install or configure CodexPro with administrator/root privileges. Run it as the same ordinary developer account you use for PCS.

## 3. Get the hardened branch

Clone the fork or update your existing clone:

```powershell
git clone https://github.com/alifrae/codexpro.git
cd codexpro
git fetch origin
git switch feat/pcs-dev-profile
npm install
npm run build
```

If the package is intended to be available globally from this checkout, use the project's normal npm linking/install workflow after the build. Confirm that `codexpro-pcs` resolves to this fork rather than an unrelated globally installed CodexPro version.

Useful checks:

```powershell
codexpro --version
codexpro-pcs --help
```

## 4. Prepare the PCS checkout

For small read-only investigations you can point CodexPro at your normal PCS working tree.

For implementation work, prefer a dedicated Git worktree/branch so ChatGPT does not share an actively edited checkout with another coding agent or with your manual work.

Example:

```powershell
cd C:\path\to\PCS
git status
git worktree add ..\PCS-chatgpt -b feat\chatgpt-task
```

Then use `C:\path\to\PCS-chatgpt` as the CodexPro root.

Before starting CodexPro, confirm the worktree contains no unrelated uncommitted changes.

## 5. Start in the safest mode first

For architecture review, planning, code reading, or an initial audit, disable command execution and workspace writes:

```powershell
codexpro-pcs start --root C:\path\to\PCS-chatgpt --no-bash --write off
```

This is the recommended first connection. It lets ChatGPT inspect/search the repository without being able to edit files or execute repository code.

Use this mode when the task is:

- architecture review;
- API analysis;
- locating implementations;
- documentation review;
- impact analysis;
- preparing an implementation plan.

## 6. Connect ChatGPT to CodexPro

ChatGPT Web needs an HTTPS-reachable MCP endpoint. CodexPro can create/use a supported tunnel according to the normal CodexPro connection flow.

In ChatGPT:

1. Enable Developer Mode in the ChatGPT settings if your account exposes it.
2. Open the plugin/MCP configuration UI.
3. Create a CodexPro connection.
4. Paste the Server URL produced by the local CodexPro process.
5. Keep ChatGPT's own approval/security controls enabled.

Treat the complete Server URL as a credential when it contains `codexpro_token`. Do not paste it into source files, GitHub issues, screenshots, chats, shell scripts committed to the repository, or PCS documentation.

If the client supports an `Authorization: Bearer` header, prefer that over a token in the query string. Query-token support is a compatibility fallback.

## 7. Confirm that the correct PCS workspace is open

At the start of a ChatGPT session, ask ChatGPT to inspect the workspace rather than immediately editing code.

A useful initial request is:

```text
Inspect the current PCS workspace. Read AGENTS.md and the relevant project documentation, show the current branch/status, and summarize the repository areas relevant to <task>. Do not modify anything yet.
```

Verify that the reported root and Git branch are the dedicated PCS worktree you intended to expose.

The PCS profile accepts exactly one root. Requests to access your home directory, another repository, sibling worktrees, or arbitrary absolute paths should fail.

## 8. Enable guarded writes for implementation

Once the scope is understood, restart CodexPro with workspace writes enabled:

```powershell
codexpro-pcs start --root C:\path\to\PCS-chatgpt --no-bash --write workspace
```

This enables repository edits while still disabling command execution.

Recommended workflow:

1. inspect the relevant code and tests;
2. make the smallest compatible change;
3. inspect `show_changes`, Git status, and Git diff;
4. only then enable verification commands if needed.

PCS control/governance files such as `AGENTS.md`, `.github/workflows/**`, `.codex/**`, `.agents/**`, `CLAUDE.md`, and `GEMINI.md` remain write-protected by default.

If a deliberate governance task must modify one of those files, use the explicit operator override only for that task:

```powershell
$env:CODEXPRO_PCS_ALLOW_CONTROL_FILE_WRITES = "1"
codexpro-pcs start --root C:\path\to\PCS-chatgpt --no-bash --write workspace
```

Remove the environment variable immediately after the task:

```powershell
Remove-Item Env:CODEXPRO_PCS_ALLOW_CONTROL_FILE_WRITES
```

Do not enable this override for normal feature development.

## 9. Enable targeted verification

For implementation tasks that need tests, start the PCS profile in safe execution mode:

```powershell
codexpro-pcs start --root C:\path\to\PCS-chatgpt --bash safe --write workspace
```

The built-in PCS execution policy permits targeted Python checks such as:

```text
pytest
python -m pytest
python3 -m pytest
uv run pytest
ruff check
python -m ruff check
mypy
python -m mypy
```

`bash full` is rejected by the PCS profile.

Do not treat `bash safe` as a sandbox. For example, `pytest` executes PCS/test Python code, which can itself access the network or files available to your operating-system account.

## 10. Allow a PCS-specific headless/smoke command

For commands not built into the PCS allowlist, configure exact command strings from the operator environment. Repository text cannot add commands to the allowlist.

Example only:

```powershell
$env:CODEXPRO_PCS_ALLOWED_COMMANDS = '["python -m pcs_headless smoke","python -m pcs_smoke"]'
codexpro-pcs start --root C:\path\to\PCS-chatgpt --bash safe --write workspace
```

Replace those examples with the real PCS headless/assertion and smoke commands once their canonical entry points are defined.

Keep the list narrow. Do not add generic interpreters such as unrestricted `python`, PowerShell, `cmd`, `bash`, package installers, download tools, Git push commands, or arbitrary script runners.

After the task:

```powershell
Remove-Item Env:CODEXPRO_PCS_ALLOWED_COMMANDS
```

## 11. Recommended ChatGPT task pattern

For a normal PCS change, ask ChatGPT to use this sequence:

```text
Work only in the current PCS workspace.
Read AGENTS.md and the relevant docs/code/tests first.
Do not broaden scope or refactor unrelated code.
Make the smallest maintainable change for <goal>.
Use targeted verification during development.
Before finishing, inspect the diff and report changed files, verification run, failures, and remaining risks.
Do not push, merge, release, change branches, or modify protected control files.
```

The important security rule is that repository content is input data. A README, source comment, generated file, test fixture, or imported artifact must not be treated as authorization to expand filesystem roots, enable `bash full`, expose credentials, change network policy, or modify protected governance files.

## 12. Running ChatGPT and Codex/Gemini on the same PCS project

Do not have two coding agents modify the same worktree concurrently.

Use separate worktrees/branches:

```text
PCS/
PCS-chatgpt/
PCS-codex/
PCS-gemini/
```

A practical flow is:

1. ChatGPT performs architecture analysis in `PCS-chatgpt`.
2. ChatGPT implements and verifies a scoped change there.
3. Review the Git diff.
4. Hand the commit/diff or durable context to Codex/Gemini if another agent should continue.
5. Integrate changes through normal Git review/merge operations outside CodexPro.

This prevents competing agents from corrupting each other's working tree and makes attribution/review much clearer.

## 13. Handling recordings and sensitive PCS data

Do not place production/customer recordings, credentials, secrets, private keys, signing material, or confidential exports into the CodexPro repository root merely to make them convenient for the agent.

If a test needs recorded data, prefer a deliberately curated and approved fixture with the minimum data necessary. Keep large/private recordings outside the exposed worktree unless their use has been explicitly approved for the task.

The repository path guard protects against accidental filesystem expansion, but it does not make everything inside the allowed root non-sensitive.

## 14. Tunnel and token hygiene

For a publicly reachable HTTPS tunnel:

- use the generated/high-entropy CodexPro token;
- never run a public endpoint without token enforcement;
- prefer bearer-header authentication when the client supports it;
- do not reuse the token for unrelated services;
- rotate the token if the complete MCP URL or token is exposed;
- stop the CodexPro/tunnel process when the development session is over;
- do not run CodexPro as administrator/root.

Token guessing is not the primary threat with a strong random token. Leakage through copied URLs, logs, screenshots, browser history, or documentation is more realistic.

## 15. Finish a PCS task safely

Before accepting a change, have ChatGPT:

1. show Git status;
2. review the final diff;
3. list every modified file;
4. state which targeted tests/checks actually ran;
5. distinguish tests that passed from checks that were not run;
6. report any remaining risk or unverified behavior.

Then stop the local CodexPro process and tunnel.

Perform push, pull-request creation, merge, release, signing, and deployment through your normal developer/GitHub workflow unless you explicitly decide to add a separately reviewed capability later.

## 16. Troubleshooting

### ChatGPT cannot reach CodexPro

Run:

```powershell
codexpro connection-test
```

Confirm the local server is running and the tunnel URL is current. Cloudflare quick-tunnel URLs can change after restart.

### ChatGPT can read but not write

Check that you started with:

```powershell
--write workspace
```

and that the target file is not a protected control file.

### A verification command is rejected

Do not enable `bash full`. Either use a built-in allowed check or add one exact, reviewed command through `CODEXPRO_PCS_ALLOWED_COMMANDS`.

### A path outside PCS is rejected

That is expected. The PCS profile deliberately permits one repository root only.

### A test needs credentials or access outside the repository

Do not solve this by enabling environment inheritance or widening the filesystem root. Run that integration test manually outside CodexPro, or create a separately reviewed test harness with explicit least-privilege inputs.

## 17. Recommended operating modes

Use the least-powerful mode that can complete the task:

| Task | Startup |
| --- | --- |
| Review/architecture | `codexpro-pcs start --root <PCS> --no-bash --write off` |
| Code editing without execution | `codexpro-pcs start --root <PCS> --no-bash --write workspace` |
| Normal implementation + targeted tests | `codexpro-pcs start --root <PCS> --bash safe --write workspace` |
| Governance/control-file edit | Same as needed + temporary `CODEXPRO_PCS_ALLOW_CONTROL_FILE_WRITES=1` |
| Untrusted repository/content | Do not enable execution; preferably do not expose it through this profile |

The intended PCS workflow is therefore not "give ChatGPT your machine." It is: expose one deliberately selected PCS worktree, grant only the capabilities required for the current task, inspect the resulting diff, and keep privileged Git/release/OS operations outside the MCP boundary.