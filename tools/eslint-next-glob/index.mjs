import path from "node:path";
import { globSync as tinyGlobSync } from "tinyglobby";

// Intentionally supports only Next 15.5.27 getRootDirs' directory lookup.
// Fail visibly if an upstream upgrade introduces a new API or option.
export function globSync(pattern, options = {}) {
  if (typeof pattern !== "string" || options.onlyDirectories !== true ||
      Object.keys(options).some(key => !["onlyDirectories", "cwd"].includes(key))) {
    throw new TypeError("Unsupported Next lint glob contract; review the scoped adapter.");
  }
  const absolute = path.isAbsolute(pattern);
  // fast-glob does not return the traversal root for a trailing globstar.
  const lookup = pattern.replace(/(^|\/)\*\*\/?$/, "$1**/*");
  return tinyGlobSync(lookup, { ...options, absolute, expandDirectories: false })
    .map(directory => {
      const normalized = directory !== path.parse(directory).root ? directory.replace(/\/$/, "") : directory;
      return pattern.startsWith("./") ? `./${normalized}` : normalized;
    });
}
