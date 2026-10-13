# Changelog

All notable changes are documented here. The format follows keep-a-changelog semantics
with SemVer prerelease channels matching DSH's. Versioning rules live in RELEASING.md.

## [0.1.1-alpha.1] — 2026-10-12

First tagged release of the rebuilt dsh-alt (repo re-imported from nix-config
`2db2ca1` at `712d397`; deployed copy was the untagged `0.1.0` at that rev).

### Fixed
- **Chunk-boundary safety of stdin translation (P-06/P-07/P-08):** Option sequences and
  bracketed-paste markers split across `read()`s are now paired or held and reliably
  released instead of being passed through untranslated or leaving paste mode stuck
  (red `d39a732`/`65fb091`/`4303780` → fix `ed6ed34`).
- **Real dsh-TUI pump (P-06):** plausible split writes could starve until the 50 ms hold
  window expired; the wrapper now re-kicks dsh-TUI's readable pump while a hold is pending
  so split Option writes pair (red `35040ec` → fix `1d9e2a0`).
- **Buffer byte-fidelity (P-09):** Buffer reads are translated byte-for-byte (latin1);
  UTF-8 code points split across reads and arbitrary invalid bytes survive untouched
  (red `bfea92d` → fix `d55640e`).
- **Parser contract no longer silently skips:** the P-11 dsh-TUI key-parser contract fails
  loudly when dsh-TUI is missing instead of skipping (analysis fix `546e42d`).

### Added
- SPEC.md: P-01..P-15 with independent oracles and per-surface rationale (web/headless
  not-applicable + required inertness property P-14).
- TEST to wrap lifecycle (P-12): one wrapper, dispose restores and releases, `enabled:false`
  installs nothing, per-stream state (`73f6b8e`).
- Real-client suites: dsh-TUI property e2e (Launchpad + chat, generated word-rule sequences,
  split-write/paste scenarios, negative controls) and web inertness e2e (plugin + baseline
  arms) over the pinned dsh/dsh-TUI and a mock model; vendored rig (private HOME/DSH_HOME,
  private tmux socket, mock model; never touches `~/.dsh`, port 3080).
- TESTING.md traceability with campaign budgets and mutation results; RELEASING.md;
  RALPH.md loop state; the Nix flake (pinned builds, devShell, checks, e2e app).

### Verified against (this release)
- DSH `0.2.1-alpha.2` (nix-dsh `f0ca0d745df8cbe99bad91d59153dbd690ae6660`),
  dsh-TUI `0.14.0 + launchpad-word-edit.patch`, plugin source `f59d75c` + version bump
  commit, Node 24.21.0, Chromium 154.0.8037.57.
- Suites green `nix flake check`: pass; fast suites `NUM_RUNS=1000` ×4 seeds pass 19/0/
  skipped 0; TUI campaign 3 seeds ×34 generated cases per surface (+ deterministic suites)
  pass 7/7 per seed; web 2/2; mutations caught 6/6. Full evidence: TESTING.md.

## [0.1.0] — pre-tagging (nix-config-era)

Imported from nix-config pkgs/dsh-alt at `2db2ca1` (deployed as
`/nix/store/9yl1v2p…-dsh-alt-0.1.0`). Never tagged in this repo.
