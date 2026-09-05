import { fileURLToPath } from "node:url";
import { assertProductionEnv } from "./lib/production-env.mjs";
import { loadProductionEnv } from "./lib/load-production-env.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
loadProductionEnv(repositoryRoot);

try {
  assertProductionEnv(process.env);
  console.log("Production environment is valid.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
