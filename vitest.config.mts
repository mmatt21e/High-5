import { defineConfig } from "vitest/config";

// Next.js preserves JSX for its compiler; component tests need a JSX transform.
export default defineConfig({ oxc: { jsx: { runtime: "automatic" } } });
