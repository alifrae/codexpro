# PCS profile security audit

Audit target: `feat/pcs-dev-profile`.

This audit focuses on the concerns raised around exposing a local coding repository to ChatGPT over MCP: tunnel/token exposure, filesystem escape, command execution, prompt injection, sensitive data, Git authority, and resource limits.

## Result

No critical repository-escape or generic-shell gap was found in the PCS-specific controls reviewed. The branch already contains substantial hardening. One concrete defense-in-depth gap was patched during this audit: the PCS launcher now forces HTTP token authentication even if the surrounding user environment previously opted into unauthenticated loopback mode.

Operational guidance was also expanded because several important risks cannot be solved by MCP path filtering alone.

## Controls confirmed

### Repository confinement

The PCS profile requires exactly one repository root. Extra allowed roots, additional projects, and `--allow-home` are rejected. Path traversal, Windows absolute/out-of-workspace paths, and symlink escape protections remain active through the normal path guard.

### Shell authority

`bash full` is rejected for the PCS profile. Safe execution has a narrow Python-oriented allowlist and blocks shell chaining/redirection, destructive filesystem commands, remote download/network tools, dangerous Git commands, and out-of-workspace path patterns.

Project-specific verification commands must be supplied by the operator as exact strings through `CODEXPRO_PCS_ALLOWED_COMMANDS`; repository content cannot add itself to this allowlist.

### Child-process environment

The PCS launcher disables full environment inheritance. Verification processes receive a restricted environment rather than inheriting the complete CodexPro/OpenAI process environment.

This reduces accidental credential leakage but is not a sandbox: executed Python/application code still has the OS authority of the account running CodexPro.

### Control-file writes

Agent/governance files are readable but write-protected by default, including `.github/workflows/**`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.codex/**`, and `.agents/**`.

An explicit operator environment override exists for intentional governance work and should not be enabled during routine feature development.

### Git authority

The profile is designed around Git inspection/diff review rather than remote repository authority. Dangerous branch/reset/clean/checkout/switch/restore/push shell commands are blocked in safe mode. Push/merge/release remain outside the intended PCS MCP workflow.

### Resource bounds

The existing implementation bounds read/write/output sizes, shell timeouts, search results, imports, HTTP sessions, and session lifetime. Bash execution truncates retained output and terminates process trees when limits are exceeded.

### Sensitive paths

The base guard blocks common credential and secret locations such as `.env`, private keys, `.ssh`, `.git`, dependency directories, build outputs, and caches.

## Patched finding: inherited unauthenticated loopback preference

### Finding

The generic CodexPro configuration supports an explicit `CODEXPRO_ALLOW_NO_HTTP_TOKEN` opt-out for loopback use. The previous `codexpro-pcs` wrapper inherited that environment variable unchanged.

Public/non-loopback/tunnel operation was already protected by the generic server rules, so this was not a public-tunnel authentication bypass. However, for the PCS profile it created an unnecessary difference between local and tunneled startup and made the hardened wrapper depend on ambient developer configuration.

### Fix

The PCS launcher now sets:

```text
CODEXPRO_REQUIRE_HTTP_TOKEN=1
CODEXPRO_ALLOW_NO_HTTP_TOKEN=0
```

This makes authentication an invariant of the PCS launcher rather than an assumption about the caller's environment.

## Remaining risks that are not bugs in the path guard

### Executed test/application code is not sandboxed

`pytest`, a PCS headless harness, or another explicitly allowed command runs code with the local user's OS privileges. That code can potentially access files outside the MCP root or the network because the operating system, not the MCP path guard, executes it.

Mitigation: use `--no-bash` for review tasks; execute only trusted PCS code; keep exact command allowlists narrow; do not run CodexPro as administrator/root. A stronger boundary would require OS-level sandboxing/containerization and is outside the current PCS profile.

### Query-string token compatibility

CodexPro supports token-in-URL authentication for clients that cannot provide an Authorization header. Strong tokens are not realistically guessable, but complete URLs can leak through copy/paste, screenshots, logs, browser history, or documentation.

Mitigation: prefer `Authorization: Bearer` when supported, treat the full MCP URL as a credential, rotate after suspected disclosure, and stop the tunnel after use. Removing query-token support outright could break current ChatGPT connection flows, so this audit does not disable it.

### Prompt injection from repository content

A malicious README, source comment, test fixture, imported artifact, or generated file can contain instructions aimed at the model. Server-side permission boundaries remain the authoritative protection; model instructions alone are not a security boundary.

Mitigation: repository text must not authorize additional roots, shell modes, credentials, network access, protected-file writes, or Git/release authority. The detailed tutorial makes this operating rule explicit.

### Sensitive data inside the allowed root

The path guard can block known secret patterns, but it cannot know whether an arbitrary `.pcap`, `.dat`, `.parquet`, recording, calibration dump, or customer artifact inside PCS is confidential.

Mitigation: do not put production/customer recordings or sensitive exports in the exposed worktree by default. Use curated minimal fixtures when a test requires data.

### Concurrent coding agents

Two agents editing the same checkout can create integrity problems even when neither is malicious.

Mitigation: use dedicated Git worktrees/branches for ChatGPT, Codex, Gemini, or manual work and integrate through normal Git review.

## Recommended privilege levels

Use the least-capable startup that can complete the task:

- review/architecture: `codexpro-pcs start --root <PCS> --no-bash --write off`
- editing without execution: `codexpro-pcs start --root <PCS> --no-bash --write workspace`
- implementation plus targeted verification: `codexpro-pcs start --root <PCS> --bash safe --write workspace`

Do not introduce a routine PCS workflow using `bash full`, home-directory access, extra repository roots, inherited full environments, generic Python/shell execution, or automatic push/merge/release authority.

## Follow-up hardening candidates

These are optional future improvements, not blockers found in this audit:

1. OS-level sandboxing for verification processes if PCS execution eventually needs to run untrusted code.
2. A client-independent bearer-token setup if/when ChatGPT MCP configuration supports it consistently, allowing query-token compatibility to be disabled for PCS.
3. Structured operation audit logs with secret/content redaction if a durable local security trail becomes necessary.
4. A PCS fixture policy that explicitly classifies which recordings/test datasets may be placed inside agent-exposed worktrees.

See `docs/PCS_TUTORIAL.md` for the recommended step-by-step operating procedure.