# Releasing dsh-alt

Procedure per the \
[new-dsh-plugin release reference](https://github.com/jakehemmerle/nix-config/blob/main/skills/new-dsh-plugin/references/release.md)
(SemVer, prerelease channels matching DSH's own scheme). Facts re-checked at every release;
these are dated observations (October 2026).

## Channel rules

- Plugin versions are SemVer `MAJOR.MINOR.PATCH[-PRERELEASE]`, independent of DSH's number.
  While `0.x`: incompatible behaviour bumps **MINOR**; user-visible capability bumps
  **MINOR**; pure bug fixes bump **PATCH**.
- While the plugin is qualified only against a prerelease DSH, the plugin version carries a
  matching prerelease channel: `-alpha.N` against a DSH alpha, `-rc.N` against a DSH rc.
  Drop the suffix only after the full suites pass against a stable DSH.
- Current fleet target: **DSH 0.2.1-alpha.2** (temporary alpha exception, October 10 2026).
  dsh-TUI: **0.14.0** with `launchpad-word-edit.patch` (see patches/SOURCE.md).
- The plugin imports **no DSH package**, so `package.json` has no peerDependencies; the
  tested DSH/dsh-TUI pair is recorded in CHANGELOG.md and TESTING.md instead.
- Moving to a different DSH/dsh-TUI build is a release: re-run all suites against that exact
  build, record the pair, bump the version.

## Release gate (all required, no bypass)

1. `git pull --ff-only` on a clean `main`; every open bead closed or justified in this
   CHANGELOG entry.
2. Fast suites at release budget: `NUM_RUNS=1000 node --test --test-concurrency=1 test/*.test.js`
   from the flake env, at least two pinned `FC_SEED`s + one automatic-seed run; **skipped 0**.
3. Real-client suites:
   - `E2E_RUNS=<34+> E2E_SEED=<s> node --test test/e2e/tui.e2e.mjs` per seed over >= 3 seeds —
     **>= 100 generated cases per surface** (Launchpad and chat), seeds logged/replayable;
   - `node --test test/e2e/web.e2e.mjs` (P-14 plugin + baseline arms).
4. `nix flake check` green (builds `checks.plugin` incl. the P-11 contract on the pinned
   dsh-TUI and `checks.dsh-tui-patched` incl. the vendored Launchpad patch).
5. Bump `package.json` version (flake package version derives from it), CHANGELOG entry,
   commit as `5.3 FLASH: release: vX.Y.Z[-alpha.N]`, annotated tag `vX.Y.Z[-alpha.N]` on
   that commit, push the commit **and the tag**.
6. Consumers (nix-config) pin tagged revisions only. Deployment and rollout then follow the
   skill's rollout guidance, including Jake's acceptance gate before any fleet sync.

## How to run everything

\`\`\`bash
nix develop                       # provides node, tmux, chromium, bd, pinned dsh/dsh-TUI + DSH_* env
nix flake check                   # gate step 4
NUM_RUNS=1000 node --test --test-concurrency=1 test/*.test.js
for s in 1 2 3; do FC_SEED=$s NUM_RUNS=1000 node --test --test-concurrency=1 test/*.test.js; done
for s in 31337 424242 991024; do E2E_SEED=$s E2E_RUNS=34 node --test --test-concurrency=1 test/e2e/tui.e2e.mjs; done
node --test --test-concurrency=1 test/e2e/web.e2e.mjs
\`\`\`
