# PCS profile security audit

Audit target: `feat/pcs-dev-profile`.

This review covers the PCS-specific CodexPro trust boundary after adding explicit safe and development execution modes.

## Result

The PCS profile now supports two intentionally different risk levels:

- `safe`: narrow verification commands only;
- `dev`: broad local development execution for a trusted PCS worktree.

The important design decision is explicit: **PCS dev is a coding capability, not a sandbox**. The implementation preserves strong MCP repository scoping and strips common credential/environment sources, but arbitrary executed code still runs with the local OS user's authority.

## Controls common to both modes

### Repository confinement for MCP operations

The PCS profile requires exactly one allowed root. Extra roots, additional projects, and home-directory exposure are rejected. Existing path traversal and symlink protections remain authoritative for MCP file operations.

### HTTP authentication

The PCS launcher forces token authentication even if ambient developer configuration previously allowed unauthenticated loopback use.

### Session/environment boundary

Codex session-history access is disabled. Full child-process environment inheritance is rejected.

### Control-file writes

MCP writes to `.github/workflows/**`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.codex/**`, and `.agents/**` are blocked by default and require an explicit operator override for intentional governance work.

### Remote/release authority

The intended PCS workflow does not include push, pull, fetch, clone, merge, release, deployment, signing, package publication, or cloud-management authority through the development shell.

## Safe mode

Safe mode retains the narrow built-in pytest/Ruff/mypy command set plus exact operator-owned PCS verification commands. It is suitable when the required execution is known in advance.

The existing hard deny patterns still block shell chaining/redirection, path escapes, dangerous Git commands, external network tools, and related generic shell behavior.

## Development mode

Development mode exists because meaningful debugging cannot always be reduced to a static command allowlist. It permits arbitrary local development commands from the selected worktree, including scripts and application execution.

Front-door deny rules still reject obvious network/remote command-line clients, remote Git and merge/rebase actions, destructive clean/reset-hard/path restore operations, package installation/update/publish commands, cloud/deployment CLIs, privilege/process-management commands, parent/home/absolute path escapes, and direct credential/control-file path references.

These are guardrails against accidental misuse, not a security boundary against malicious or arbitrary program logic.

## Credential hardening for executed commands

PCS execution now uses a restricted environment and isolated temporary HOME/profile rather than the developer's real HOME.

The child environment additionally disables normal Git system/global credential configuration and interactive credential prompting, resets Git credential-helper discovery, and redirects npm/pip user configuration away from the real user profile.

This materially reduces accidental token/credential leakage during normal development commands.

## Residual risk: arbitrary code execution

A command such as `python diagnostic.py` can execute code that directly calls OS filesystem or networking APIs. No shell regex can reliably constrain that behavior.

Consequences:

- a trusted PCS test/script can still read files available to the OS user;
- code can create sockets directly even though `curl`/SSH commands are blocked;
- code can invoke subprocesses programmatically;
- code can modify governance files even though MCP write APIs and obvious direct shell references are blocked;
- an intentionally malicious process can attempt to reconstruct external authority.

Mitigations:

- enable `dev` only for trusted PCS worktrees;
- use a dedicated Git worktree;
- run CodexPro as a non-admin/non-root user;
- do not keep production/customer recordings or secrets in the exposed worktree;
- use an OS sandbox/container/restricted account if untrusted code must execute.

## Sensitive PCS data

The path guard cannot infer whether arbitrary `.pcap`, `.dat`, `.parquet`, calibration dumps, or customer recordings inside the selected worktree are confidential. Keep sensitive recordings outside agent-exposed worktrees unless explicitly required and approved. Prefer curated minimal fixtures.

## Concurrent agents

Two coding agents editing the same checkout remain an integrity risk. Use dedicated worktrees/branches per agent and integrate through normal Git review.

## Verification requirements before merge

The branch should not be treated as release-ready until the existing GitHub Actions matrix validates the TypeScript build, complete smoke suite including PCS safe/dev tests, Linux runner, Windows runner, stress tests, and package contents.

The CI workflow already targets Ubuntu and Windows on pull requests. If the fork does not start Actions runs, repository Actions settings must be enabled outside this code change.

## Follow-up candidates

Not required for the current trusted-PCS threat model:

1. OS-level sandboxing for dev execution if untrusted code becomes a requirement.
2. Durable structured operation audit logs with secret/content redaction.
3. A formal PCS fixture/data classification policy.
4. Client-independent bearer-header authentication if ChatGPT plugin configuration makes query-token compatibility unnecessary.
