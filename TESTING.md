# dsh-alt testing — traceability, campaigns and evidence

STATE.md-style companion to [SPEC.md](SPEC.md) (properties) and [RELEASING.md](RELEASING.md)
(release gate). Every SPEC property maps to at least one runnable test; there are no silent
skips anywhere in the suite. Latest full-campaign state below is from the round-C release
run, 2026-10-12, source commit `f59d75c` (main).

## Versions under test (pinned)

| Component | Version | Source |
| --- | --- | --- |
| DSH | 0.2.1-alpha.2 | nix-dsh `f0ca0d745df8cbe99bad91d59153dbd690ae6660` (the rev nix-config pins) |
| dsh-TUI | 0.14.0 + launchpad-word-edit patch | npm `@deepseek-harness-tui/dsh-tui`, built by `nix/dsh-tui.nix` |
| Node / Chromium | 24.21.0 / 154.0.8037.57 | devShell (`nix develop`) |
| Plugin source | `f59d75c` (repo main) | repo checkout the suites ran from |

All runs below use the flake env: `export DSH_BIN DSH_TUI_DIR DSH_TUI_TYPES CHROMIUM_PATH`
(`nix develop` or `nix run .#e2e` sets them). Campaign logs live in `/tmp/dsh-alt-logs/` at
run time.

## Property → test → result map (release run)

"Fast" = `node --test --test-concurrency=1 test/*.test.js` against node with the pinned
dsh-TUI types. "TUI" = `test/e2e/tui.e2e.mjs` over a real dsh-TUI process in a private tmux
socket against the mock model. "Web" = `test/e2e/web.e2e.mjs` in Playwright/Nix Chromium
against a real `dsh web` profile. Core (no DSH) results are the number-level evidence of the
TUI/Web rows; they are listed separately because they run in the Nix package check.

| ID | Test | Surface | Result (release run) |
| --- | --- | --- | --- |
| P-01 | translate.test.js "P-01 …"; tui.e2e.mjs Launchpad/chat generated `optbs` actions | Core, TUI-L, TUI-C | pass 19/19 fast ×4 seeds (below); covered in all 3×34 generated TUI cases |
| P-02/P-03 | translate.test.js "P-02 P-03 …"; tui.e2e `optleft`/`optright`/`ctrlleft`/`ctrlright` actions with caret asserts | Core, TUI-L, TUI-C | pass; caret equality asserted after every generated action |
| P-04 | translate.test.js "P-04 plain keys and Escape are untouched"; tui.e2e `left`/`right`/`bspace`/`type` actions | Core, TUI-L, TUI-C | pass; all generated sequences model-checked per action |
| P-05 | translate.test.js "P-05 bracketed paste …"; tui.e2e.mjs "P-08 P-05 P-15 … paste body verbatim" (editor-observable) | Core, TUI-C | pass; paste bodies (`pasted esc:…`) reach the prompt with no 0x17 |
| P-06 (chunk independence) | translate.property.test.js "P-06 any split …" (fast-check, oracle `support/model.js`); wrapper.test.js "P-06 P-10 reads split at any point …" (real timer windows); tui.e2e.mjs "P-06 TUI: ESC and DEL in two fast writes …" | Core, TUI-C | pass; observed split-delivery gap 15–21 ms (< 50 ms hold) |
| P-07 | translate.property.test.js "P-07 a paste-start marker split …" | Core | pass |
| P-08 | translate.property.test.js "P-08 …"; tui.e2e.mjs "P-08 P-05 P-15 …" (resume after split paste-end) | Core, TUI-C | pass |
| P-09 | wrapper.test.js "P-09 Buffer reads …" + named regression (UTF-8 split before Option sequence) | Core | pass |
| P-10 (liveness) | wrapper.test.js "P-10 a lone Escape is released unchanged …"; tui.e2e.mjs "P-10 TUI: a lone Escape still clears the draft" | Core, TUI-L, TUI-C | pass |
| P-11 (parser contract, no skip) | translate.test.js "P-11 dsh-TUI parses every translation as the bound key" | Core (contract) | pass 19 fast suites with pinned types; fail-not-skip verified: without `DSH_TUI_TYPES` the suite reports **fail 1 (P-11, clear instructions)**, skipped 0 |
| P-12 (lifecycle) | lifecycle.test.js (5 tests incl. single wrapper, restore, `enabled:false`, timed release, per-stream state) | Core | pass |
| P-13 (Launchpad patch contract) | nix build check (patch applies to pinned 0.14.0; install check re-runs P-11) + the Launchpad half of every tui.e2e property | TUI-L | pass (same build the TUI campaigns ran on, both fresh TUI per case and long-lived) |
| P-14 (web inertness) | web.e2e.mjs: plugin arm + baseline arm | Web | pass; plugin arm: composer typing/Backspace/Alt-chord browser-native, prompt reaches the mock exactly once verbatim, no plugin-load warnings, errors/profile differ from baseline only by nothing; both arms share exactly one understood stock 404 (see below). Runner exits cleanly after cleanup |
| P-15 (prompt fidelity) | submitDraft() matcher in tui.e2e.mjs (both surfaces, every generated case) | TUI-L, TUI-C | pass |

## Campaign budgets (release run)

- **Fast suites:** `NUM_RUNS=1000` (P-06/P-07/P-08 translate properties at 1000 each;
  P-06/P-10 stream and P-09 wrapper properties at 100 via `NUM_RUNS/10`, real timers).
  Pass 19 / fail 0 / skipped **0**, four executions: one automatic-seed run plus pinned
  `FC_SEED=1`, `2`, `3` (replayable:
  `FC_SEED=<s> NUM_RUNS=1000 node --test --test-concurrency=1 test/*.test.js`).
  The automatic-seed run logged: P-06 1472886190, P-07 1569169686, P-08 370196832,
  P-06/P-10 stream 941415198, P-09 1891033566.
- **TUI real-client campaign** (`E2E_RUNS` generated word-rule cases per surface,
  E2E seed replays: `E2E_SEED=<s> E2E_RUNS=<n> node --test --test-concurrency=1 test/e2e/tui.e2e.mjs`):
  - seed **31337**: 34 Launchpad + 34 chat cases + 5 deterministic suites — pass 7/7 (~299 s)
  - seed **424242**: idem — pass 7/7 (~301 s)
  - seed **991024**: idem — pass 7/7 (~302 s)
  - => **102 generated cases per surface over 3 seeds**, above the ≥100/≥3 budget; every
    step asserted against the independent word-rule model, every case ends with an
    Enter-submitted draft (P-15). Deterministic suites in each run: split ESC|DEL pair ×5,
    split paste-end + resume, paste body verbatim, lone Escape, 2 negative controls.
  - First seed-31337 execution failed at case 27: the e2e matcher, not the product — see
    "Fixed during the campaign" below (fix commit `d220275`; probe proves stock trim).
  - Smoke replay: seed 777, E2E_RUNS=2 → pass 7/7 (~52 s) before and after the rig fix.
- **Web** (`node --test test/e2e/web.e2e.mjs`, ~25 s): pass 2/2 (plugin arm + baseline
  parity arm; ~25 s total).

### Stock noise, proven plugin-independent (both arms, identical flow)

The pinned 0.2.1-alpha.2 web app references `/open-in-app/icon/zed`, an editor icon asset
it does not ship; the stock client (dsh-client-ui-open-in-app) answers 404 and the browser
logs one generic "Failed to load resource … 404" console error. Verified identical with and
without dsh-alt loaded, by driving the **identical composer flow** in both arms of
web.e2e.mjs (turn submitted in each): exactly one such request+echo, nothing else, in both
arms. The plugin arm additionally proves: typing/Backspace/Alt chords match the browser's
own editor, and the prompt reaches the mock model exactly once, verbatim.

### Fixed during the campaign (red → fix recorded honestly)

- 2026-10-12, seed 31337: the TUI e2e submission matcher required the model prompt to
  begin with the draft's leading whitespace; dsh-TUI 0.14.0's own editor trims surrounding
  whitespace when it submits (probe: `'  abc def  '` reaches the mock as `'abc def'`). The
  failing campaign (launchpad case 27, draft `' alphagamma'`) is the red; the matcher fix
  and the SPEC P-15 note are `d220275`. Not a product bug (the plugin never sees the draft).
- The vendored mock's `close()` now destroys idle/keep-alive sockets (previously a failure
  below `browser.close()` could leave the node process hanging ~400 s — a failing test must
  not hang). Fix committed with the P-14 suite (`f59d75c`).

## Mutation testing (alt-hvt.8, round C)

Mutants planted one at a time in an isolated `git worktree`, fast suites run with
`FC_SEED=7 NUM_RUNS=200` and pinned dsh-TUI types; original restored after each.

| Mutant | File | Planted defect (class) | Killed by (failing tests) | Result |
| --- | --- | --- | --- | --- |
| M1 | lib/translate.js | `CSI 1;3D` mapping returns Ctrl+Right (wrong key code) | P-02/P-03, P-06 (translate + stream), P-06 regression, P-07, P-11 | caught |
| M2 | lib/translate.js | paste-mode guard dropped (`if (paste)` → `if (false)`) | P-05, P-06, P-07, P-08 | caught |
| M3 | lib/translate.js | hold window disabled (a read may end mid-sequence) | P-06 (translate + ESC/DEL + stream), P-07, P-09, P-10, P-12 | caught |
| M4 | index.js | dispose() does not restore `prototype.read` (missed dispose) | P-12 (all four lifecycle tests), P-06/P-10 stream | caught |
| M5 | index.js | Buffer path decodes UTF-8 instead of latin1 (the P-09 bug class) | P-09 + P-09 regression | caught |
| M6 | index.js | held bytes are never scheduled for release (byte loss) | P-10, P-06/P-10 stream | caught |

**Caught 6/6.** Both adapters covered (three mutants each). Logs:
`/tmp/dsh-alt-logs/mutant-M*.log` at run time. Earlier rounds' red/fix pairs (P-06/P-07/P-08
chunk-safety, P-09 Buffer, real-TUI pump re-kick) are the same property classes catching
re-introduced product bugs.

## Historical closures re-verified this round (Step-0 audit)

| Bead | Evidence re-checked today | Verdict |
| --- | --- | --- |
| alt-hvt.1 | nix-config `6a7e613` pkgs/dsh-alt files byte-identical to repo `712d397`; deployed store path `9yl1v2p…` present in the current system closure | closure valid (point-in-time reconcile; later bug-fix commits are the release's job) |
| alt-hvt.2 | SPEC.md `6dbab8a`: P-01..P-15 with IDs/oracles/surfaces; web not-applicable rationale; Launchpad+chat | valid |
| alt-hvt.3 | flake pins; `checks.plugin`/`checks.dsh-tui-patched` store paths "result"/"result-1" present; `nix flake check` re-run green at the release step | valid |
| alt-hvt.4 | vendored rig imports only node builtins (no ~/.agents, no nix-config); used by all green e2e runs this round | valid |
| alt-hvt.6 | red `35040ec` (test-only) → fix `1d9e2a0`; suite re-run green today (see campaign) | valid |
| alt-hvt.10/.11/.12 | red `d39a732`/`65fb091`/`4303780` (test-only) → fix `ed6ed34`; properties green at 1000 runs ×4 seeds today | valid |
| alt-hvt.13 | red `bfea92d` → fix `d55640e`; P-09 green today; re-introduction caught by M5 | valid |
| alt-hvt.14 | `546e42d`: P-11 fails (not skips) without types — re-verified today; passes with pinned types | valid |
| alt-hvt.15 | `73f6b8e`: lifecycle tests green today | valid |

No bead was reopened: every closed bead's recorded evidence reproduced today.

## Known residual (honest)

- TUI testing runs the flake-pinned build; the deployed nix-config copy still pins
  dsh-alt `0.1.0` (pre-fix). The released version must be re-vendored/pinned in nix-config
  by whoever deploys — out of this repo's scope this round.
- Peer replays (other repos) and their leftover rig dirs/tmux sockets on this machine are
  out of this repo's scope; only dsh-alt's own artifacts were touched.
