#!/usr/bin/env node
/** Boots the mock on a free port, runs a command against it, tears it down. */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4319);
const BASE = "http://localhost:" + PORT;

const mock = spawn(process.execPath, [join(HERE, "mock-server.mjs")], {
  env: { ...process.env, PORT: String(PORT), ASSAY_MOCK_WINDOW: process.env.ASSAY_MOCK_WINDOW ?? "fixed" },
  stdio: ["ignore", "pipe", "inherit"],
});
mock.stdout.on("data", () => {});

async function waitForBoot(deadlineMs = 10_000) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(BASE + "/v1/health");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("mock did not boot within " + deadlineMs + "ms");
}

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("usage: node tools/with-mock.mjs <command> [args...]");
  process.exit(2);
}

try {
  await waitForBoot();
  const child = spawn(argv[0], argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env, BASE },
    shell: process.platform === "win32",
  });
  const code = await new Promise((r) => child.on("exit", r));
  mock.kill();
  process.exit(code ?? 0);
} catch (e) {
  mock.kill();
  console.error(String(e));
  process.exit(1);
}
