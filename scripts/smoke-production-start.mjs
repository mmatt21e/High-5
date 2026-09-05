import { spawn } from "node:child_process";

const port = Number(process.env.PORT ?? "3210");
const origin = `http://127.0.0.1:${port}`;
const output = [];
const child = spawn(process.execPath, ["scripts/start.mjs"], {
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => output.push(chunk));
}

const earlyExit = new Promise((_, reject) => {
  child.once("exit", (code, signal) => {
    reject(new Error(`Production server exited before readiness (${code ?? signal}).`));
  });
});

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function waitUntilReady() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/auth/session`);
      if (response.ok) return;
    } catch {
      // The socket is expected to refuse connections while Next.js prepares.
    }
    await delay(250);
  }
  throw new Error("Production server did not become ready within 45 seconds.");
}

try {
  await Promise.race([waitUntilReady(), earlyExit]);
  console.log(`Production start smoke test passed at ${origin}.`);
} catch (error) {
  console.error(output.join(""));
  throw error;
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolveExit) => {
      const forceKill = setTimeout(() => {
        child.kill("SIGKILL");
        resolveExit();
      }, 10_000);
      child.once("exit", () => {
        clearTimeout(forceKill);
        resolveExit();
      });
    });
  }
}
