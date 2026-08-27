#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const launcher = path.join(scriptDir, "codexpro.mjs");
const argv = process.argv.slice(2);

function optionValue(name) {
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === `--${name}`) return argv[i + 1];
    if (value.startsWith(`--${name}=`)) return value.slice(name.length + 3);
  }
  return undefined;
}

function hasFlag(name) {
  return argv.some((value) => value === `--${name}` || value.startsWith(`--${name}=`));
}

function withoutOption(name) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === `--${name}`) {
      i += 1;
      continue;
    }
    if (value.startsWith(`--${name}=`)) continue;
    out.push(value);
  }
  return out;
}

const pcsMode = (optionValue("pcs-mode") ?? process.env.CODEXPRO_PCS_EXECUTION_MODE ?? "safe").trim().toLowerCase();
if (pcsMode !== "safe" && pcsMode !== "dev") {
  console.error("codexpro-pcs --pcs-mode must be safe or dev.");
  process.exit(2);
}

const bash = optionValue("bash");
if (bash === "full") {
  console.error("codexpro-pcs refuses --bash full. Use --pcs-mode dev for broad trusted development execution.");
  process.exit(2);
}
if (hasFlag("allow-home") || hasFlag("allow-root") || hasFlag("project")) {
  console.error("codexpro-pcs permits one PCS repository root only. Remove --allow-home/--allow-root/--project.");
  process.exit(2);
}

if (pcsMode === "dev") {
  const write = optionValue("write");
  if (hasFlag("no-bash") || bash === "off") {
    console.error("codexpro-pcs --pcs-mode dev requires execution. Remove --no-bash/--bash off or use --pcs-mode safe.");
    process.exit(2);
  }
  if (write && write !== "workspace") {
    console.error("codexpro-pcs --pcs-mode dev requires --write workspace because executed development commands can modify the worktree.");
    process.exit(2);
  }
}

const forwarded = withoutOption("pcs-mode");
if (!hasFlag("tool-mode")) forwarded.push("--tool-mode", "full");
if (!hasFlag("bash") && !hasFlag("no-bash")) forwarded.push("--bash", "safe");
if (!hasFlag("codex-sessions")) forwarded.push("--codex-sessions", "off");
if (pcsMode === "dev" && !hasFlag("write")) forwarded.push("--write", "workspace");

const env = {
  ...process.env,
  CODEXPRO_PROFILE: "pcs",
  CODEXPRO_PCS_EXECUTION_MODE: pcsMode,
  CODEXPRO_INHERIT_ENV: "0",
  CODEXPRO_REQUIRE_HTTP_TOKEN: "1",
  CODEXPRO_ALLOW_NO_HTTP_TOKEN: "0"
};
delete env.CODEXPRO_ALLOW_HOME;
delete env.CODEXPRO_ALLOWED_ROOTS;
delete env.CODEBASE_BRIDGE_ALLOWED_ROOTS;

const result = spawnSync(process.execPath, [launcher, ...forwarded], {
  stdio: "inherit",
  env,
  windowsHide: true
});
if (result.error) {
  console.error(`Unable to start CodexPro PCS profile: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
