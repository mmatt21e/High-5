# Scoped Next lint glob adapter

This development-only package replaces only fast-glob beneath the pinned
@next/eslint-plugin-next 15.5.27. All official Next/React/accessibility/TypeScript
rules and configuration remain unchanged. tinyglobby 0.2.17 is the maintained
matching engine; no vulnerable braces/micromatch implementation is copied.

Next uses only globSync(string, {onlyDirectories:true}). The wrapper disables
implicit directory expansion, preserves absolute/static-dot paths, removes
returned directory suffixes and excludes a trailing-globstar traversal root to
match the prior engine. New API/options fail visibly and require review.

The file override is relative to the pinned plugin's node_modules location.
Clean npm ci and resolution tests guard this contract. The committed .npmrc
uses install-links=true to pack the local dependency reproducibly. Docker copies
the source and .npmrc before npm ci; the installed package is self-contained.
It is development-only and removed by production pruning.
Node 22.12+ is required for CommonJS Next to load this synchronous ESM module;
local/CI/build validation uses Node 22.23.2 or the pinned Docker Node 22 runtime.

scripts/__tests__/eslintGlob.test.mjs checks matching fixtures, effective-config
parity and representative bad/good lint diagnostics. The compact SHA-256 configuration
fixture hashes the complete normalized pre-replacement contract (rules, options,
parsers, globals, settings and resolvers); update it only after an
intentional, reviewed lint-rule change. Remove this adapter once an upstream
Next lint dependency resolves the advisory, after repeating parity/audit checks.
