import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../dist/config.js";
import { PathGuard } from "../dist/guard.js";
import { makeRestrictedBashEnv, runBash } from "../dist/bashOps.js";

const ENV_KEYS = [
  "CODEXPRO_PROFILE",
  "CODEXPRO_ALLOWED_ROOTS",
  "CODEBASE_BRIDGE_ALLOWED_ROOTS",
  "CODEXPRO_ALLOW_HOME",
  "CODEXPRO_BASH_MODE",
  "CODEXPRO_CODEX_SESSIONS",
  "CODEXPRO_INHERIT_ENV",
  "CODEXPRO_PCS_ALLOW_CONTROL_FILE_WRITES",
  "CODEXPRO_PCS_ALLOWED_COMMANDS",
  "CODEXPRO_PCS_EXECUTION_MODE",
  "CODEXPRO_TOOL_MODE",
  "OPENAI_API_KEY",
  "AWS_SECRET_ACCESS_KEY"
];

const previousEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
for (const key of ENV_KEYS) delete process.env[key];

try {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "codexpro-pcs-profile-")));
  const otherRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "codexpro-pcs-profile-other-")));
  await writeFile(path.join(root, "AGENTS.md"), "# Agent instructions\n", "utf8");
  await writeFile(path.join(root, "module.py"), "VALUE = 1\n", "utf8");

  const config = loadConfig(["--root", root, "--profile", "pcs"]);
  assert.equal(config.profile, "pcs");
  assert.deepEqual(config.allowedRoots, [root]);
  assert.equal(config.bashMode, "safe");
  assert.equal(config.toolMode, "full");
  assert.equal(config.codexSessions, "off");
  assert.equal(config.inheritEnv, false);
  assert.ok(config.writeBlockedGlobs.includes("AGENTS.md"));

  const guard = new PathGuard(config);
  const workspace = { id: "ws_pcs_smoke", root, openedAt: new Date().toISOString() };
  assert.equal(guard.resolve(workspace, "AGENTS.md").relPath, "AGENTS.md");
  assert.throws(
    () => guard.resolve(workspace, "AGENTS.md", { forWrite: true }),
    /write-protected by the active profile/
  );
  assert.equal(guard.resolve(workspace, "module.py", { forWrite: true }).relPath, "module.py");

  const pwd = await runBash(config, guard, workspace, "pwd");
  assert.equal(pwd.exitCode, 0);
  await assert.rejects(
    () => runBash(config, guard, workspace, "git branch -D unsafe"),
    /not permitted by the PCS safe execution policy|blocked in CODEXPRO_BASH_MODE=safe/
  );
  await assert.rejects(
    () => runBash(config, guard, workspace, "npm run build"),
    /not permitted by the PCS safe execution policy/
  );
  await assert.rejects(
    () => runBash(config, guard, workspace, "node -e \"console.log('not-safe')\""),
    /not permitted by the PCS safe execution policy/
  );
  await assert.rejects(
    () => runBash(config, guard, workspace, String.raw`python -m pytest ..\outside\test.py`),
    /blocked in CODEXPRO_BASH_MODE=safe/
  );
  await assert.rejects(
    () => runBash(config, guard, workspace, String.raw`python -m pytest C:\outside\test.py`),
    /blocked in CODEXPRO_BASH_MODE=safe/
  );

  assert.throws(
    () => loadConfig(["--root", root, "--allow-root", otherRoot, "--profile", "pcs"]),
    /requires exactly one repository root/
  );

  process.env.CODEXPRO_ALLOWED_ROOTS = root;
  const launcherCompatible = loadConfig(["--root", root, "--profile", "pcs"]);
  assert.deepEqual(launcherCompatible.allowedRoots, [root]);
  process.env.CODEXPRO_ALLOWED_ROOTS = otherRoot;
  assert.throws(
    () => loadConfig(["--root", root, "--profile", "pcs"]),
    /requires exactly one repository root/
  );
  delete process.env.CODEXPRO_ALLOWED_ROOTS;

  process.env.CODEXPRO_BASH_MODE = "full";
  assert.throws(
    () => loadConfig(["--root", root, "--profile", "pcs"]),
    /does not permit CODEXPRO_BASH_MODE=full/
  );
  delete process.env.CODEXPRO_BASH_MODE;

  process.env.CODEXPRO_INHERIT_ENV = "1";
  assert.throws(
    () => loadConfig(["--root", root, "--profile", "pcs"]),
    /does not permit CODEXPRO_INHERIT_ENV=1/
  );
  delete process.env.CODEXPRO_INHERIT_ENV;

  process.env.CODEXPRO_PCS_ALLOWED_COMMANDS = JSON.stringify(["python -m pcs.headless smoke"]);
  const configured = loadConfig(["--root", root, "--profile", "pcs"]);
  assert.deepEqual(configured.pcsAllowedCommands, ["python -m pcs.headless smoke"]);
  delete process.env.CODEXPRO_PCS_ALLOWED_COMMANDS;

  process.env.CODEXPRO_PCS_ALLOW_CONTROL_FILE_WRITES = "1";
  const governance = loadConfig(["--root", root, "--profile", "pcs"]);
  const governanceGuard = new PathGuard(governance);
  assert.equal(governanceGuard.resolve(workspace, "AGENTS.md", { forWrite: true }).relPath, "AGENTS.md");
  delete process.env.CODEXPRO_PCS_ALLOW_CONTROL_FILE_WRITES;

  process.env.CODEXPRO_PCS_EXECUTION_MODE = "invalid";
  await assert.rejects(
    () => runBash(config, guard, workspace, "pwd"),
    /CODEXPRO_PCS_EXECUTION_MODE must be 'safe' or 'dev'/
  );

  process.env.CODEXPRO_PCS_EXECUTION_MODE = "dev";
  const devConfig = loadConfig(["--root", root, "--profile", "pcs"]);
  const broad = await runBash(devConfig, guard, workspace, "node -e \"console.log('pcs-dev-ok')\"");
  assert.equal(broad.exitCode, 0);
  assert.match(broad.stdout, /pcs-dev-ok/);

  const writeProbe = await runBash(
    devConfig,
    guard,
    workspace,
    "node -e \"require('node:fs').writeFileSync('dev-probe.txt','ok')\""
  );
  assert.equal(writeProbe.exitCode, 0);
  assert.equal(await readFile(path.join(root, "dev-probe.txt"), "utf8"), "ok");

  await assert.rejects(
    () => runBash(devConfig, guard, workspace, "git push origin main"),
    /blocked by the PCS dev execution boundary/
  );
  await assert.rejects(
    () => runBash(devConfig, guard, workspace, "curl https://example.com"),
    /blocked by the PCS dev execution boundary/
  );
  await assert.rejects(
    () => runBash(devConfig, guard, workspace, "npm publish"),
    /blocked by the PCS dev execution boundary/
  );
  await assert.rejects(
    () => runBash(devConfig, guard, workspace, "node ../outside.js"),
    /blocked by the PCS dev execution boundary/
  );
  await assert.rejects(
    () => runBash(devConfig, guard, workspace, "cat AGENTS.md"),
    /blocked by the PCS dev execution boundary/
  );

  process.env.OPENAI_API_KEY = "should-not-reach-child";
  process.env.AWS_SECRET_ACCESS_KEY = "should-not-reach-child";
  const restrictedEnv = makeRestrictedBashEnv(devConfig, process.env);
  assert.equal(restrictedEnv.OPENAI_API_KEY, undefined);
  assert.equal(restrictedEnv.AWS_SECRET_ACCESS_KEY, undefined);
  assert.notEqual(restrictedEnv.HOME, os.homedir());
  assert.equal(restrictedEnv.GIT_TERMINAL_PROMPT, "0");
  assert.equal(restrictedEnv.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(restrictedEnv.GIT_CONFIG_VALUE_0, "");

  const launcher = fileURLToPath(new URL("./codexpro-pcs.mjs", import.meta.url));
  const invalidMode = spawnSync(process.execPath, [launcher, "--pcs-mode", "unsafe"], { encoding: "utf8" });
  assert.equal(invalidMode.status, 2);
  assert.match(invalidMode.stderr, /--pcs-mode must be safe or dev/);
  const impossibleDev = spawnSync(process.execPath, [launcher, "--pcs-mode", "dev", "--no-bash"], { encoding: "utf8" });
  assert.equal(impossibleDev.status, 2);
  assert.match(impossibleDev.stderr, /requires execution/);

  console.log("PCS profile safe/dev smoke checks passed.");
} finally {
  for (const [key, value] of previousEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
