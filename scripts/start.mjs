import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertProductionEnv } from "./lib/production-env.mjs";
import { loadProductionEnv } from "./lib/load-production-env.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
loadProductionEnv(repositoryRoot);
try {
  assertProductionEnv(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
const child = spawn(process.execPath, [tsxCli, "server.ts"], {
  cwd: repositoryRoot,
  env: process.env,
  stdio: "inherit",
});

let requestedSignal;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    requestedSignal = signal;
    child.kill(signal);
  });
}

child.once("error", (error) => {
  console.error("Unable to start the production server:", error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  const effectiveSignal = requestedSignal ?? signal;
  process.exitCode = effectiveSignal === "SIGINT" ? 130 : effectiveSignal ? 143 : (code ?? 1);
});
