import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

export function loadProductionEnv(repositoryRoot) {
  process.env.NODE_ENV = "production";
  loadEnvConfig(repositoryRoot, false);
}
