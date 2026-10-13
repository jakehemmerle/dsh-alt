# RALPH loop state — dsh-alt

Gotchas and loop state for further rounds. Product properties: [SPEC.md](SPEC.md).
Traceability + evidence: [TESTING.md](TESTING.md). Release procedure: [RELEASING.md](RELEASING.md).

## Current state (2026-10-12, round C — final)

Board: **all work beads closed** (`.1–.15`), epic last. Release cut this round:
**v0.1.1-alpha.1** (see CHANGELOG.md / RELEASING.md).

### Round history

- **Round 1/2 (2026-10-11/12, previous engineer):** beads .1–.4, bug beads .10–.15 and .6
  (TUI e2e) were executed and closed with red/fix pairs; no round report was ever sent to
  the lead. Round C ran a Step-0 closure audit over every closed bead and re-verified all
  of them against today's live runs — no bead reopened, every recorded sha/evidence
  reproduced (details in TESTING.md "Historical closures re-verified").
- **Round 3 (round C, this engineer):**
  - Step 0 closure audit: no reopen; 5 recorded red → fix pairs verified in history.
  - alt-hvt.5 finished: web inertness (P-14) plugin arm + no-plugin baseline arm, both
    green on the pinned `dsh web` (fix commits `d220275`, `f59d75c`).
  - Testing-oracle fix found and fixed during the TUI campaign: the submission matcher
    didn't model dsh-TUI 0.14.0's stock surrounding-whitespace trim on submit
    (red: seed 31337 case 27; probe + SPEC P-15 note; `d220275`).
  - Rig hardening: `mock.close()` destroys kept-alive sockets; a failed e2e no longer
    hangs the runner (`f59d75c`).
  - alt-hvt.7: TESTING.md written (traceability + budgets + mutation table).
  - alt-hvt.8: mutation campaign caught **6/6** (translate ×3, wrapper ×3).
  - alt-hvt.9: RELEASING.md + CHANGELOG.md, version bump, `nix flake check` green,
    tagged **v0.1.1-alpha.1** and pushed (commit + annotated tag).

## Gotchas learned this round (keep for future rounds)

1. **dsh-TUI 0.14.0 trims surrounding whitespace when submitting a prompt** (Launchpad and
   chat). Any prompt-fidelity check must compare modulo that trim — the plugin's job is
   byte-fidelity of its *input*, the editor's trim is stock behavior outside it.
2. **The pinned dsh web build 404s `/open-in-app/icon/zed`** (unshipped editor icon) only
   once a turn has been submitted; it is stock noise (proven by the plugin-less baseline
   arm). Don't treat it as a web break and don't expect it before the first turn.
3. **mock-llm `close()` must destroy keep-alive sockets** — otherwise a failed web test
   hangs the runner undetected for minutes.
4. Leftover rig tmux/dsh process trees and `/tmp/dsh-rig-*` dirs on this host come from
   several plugins' runs; never pkill them broadly — identify each rig context by content
   (`cordis.patch.yml` plugin rows) before touching it, and never touch other repos' art.
5. The TUI campaign is ~5 min per seed at `E2E_RUNS=34` (Launchpad suites spawn a fresh
   TUI per case); budget releases accordingly and set the suite timeout before scaling.

## Protocol reminder (unchanged from AGENTS.md)

- Work beads in bd (prefix `alt`), close only with evidence; `bd export` before committing
  beads; the Dolt dir itself stays uncommitted.
- Nix env (`nix develop`) provides node/tmux/chromium/dsh/dsh-TUI + the DSH_* vars.
- Commits: direct to `main`, `5.3 FLASH:  ` prefix, own paths only, `git pull --ff-only`
  first; red commit (failing test alone) before every real bug fix; suites green before a
  non-red commit.
- Real-client suites stay isolated (private HOME/DSH_HOME, free port, `tmux -f /dev/null`
  private socket, mock model). Never ~/.dsh, ~/.dsh-tui, port 3080 or Jake's tmux.
