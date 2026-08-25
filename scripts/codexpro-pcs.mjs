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

const bash = optionValue("bash");
if (bash === "full") {
  console.error("codexpro-pcs refuses --bash full. Use safe/off plus CODEXPRO_PCS_ALLOWED_COMMANDS.");
  process.exit(2);
}
if (hasFlag("allow-home") || hasFlag("allow-root") || hasFlag("project")) {
  console.error("codexpro-pcs permits one PCS repository root only. Remove --allow-home/--allow-root/--project.");
  process.exit(2);
}

const forwarded = [...argv];
if (!hasFlag("tool-mode")) forwarded.push("--tool-mode", "full");
if (!hasFlag("bash") && !hasFlag("no-bash")) forwarded.push("--bash", "safe");
if (!hasFlag("codex-sessions")) forwarded.push("--codex-sessions", "off");

const env = {
  ...process.env,
  CODEXPRO_PROFILE: "pcs",
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
