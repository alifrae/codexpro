import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../dist/config.js";
import { PathGuard } from "../dist/guard.js";
import { runBash } from "../dist/bashOps.js";

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
  "CODEXPRO_TOOL_MODE"
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
    /not permitted by the PCS execution policy|blocked in CODEXPRO_BASH_MODE=safe/
  );
  await assert.rejects(
    () => runBash(config, guard, workspace, "npm run build"),
    /not permitted by the PCS execution policy/
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

  console.log("PCS profile smoke checks passed.");
} finally {
  for (const [key, value] of previousEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
