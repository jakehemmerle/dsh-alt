# Agent instructions

- Work is tracked in the workspace Beads instance (`nx`, `~/ws/.beads`), label `project:dsh`.
  In the `~/ws/code/personal/<repo>` clone `bd` resolves there through `.beads/redirect`
  (written by `ws sync`); this repo has no Beads database of its own.
- Loop state and gotchas: [RALPH.md](RALPH.md). Product properties: [SPEC.md](SPEC.md).
  Traceability and evidence: [TESTING.md](TESTING.md). Releases: [RELEASING.md](RELEASING.md).
- Enter the Nix environment with `nix develop`; fast suites: `npm test` /
  `nix flake check`; real-client suites: `nix run .#e2e`.
- Commit directly to `main` as `jakehemmerle <jakehemmerle@protonmail.com>`; stage
  explicit paths only. Bugs: failing test commit first (`red: …`), fix second.
- Real-client tests must stay isolated: private HOME/DSH_HOME, port 0, private tmux
  socket (`-f /dev/null`), local mock model. Never touch `~/.dsh`, `~/.dsh-tui`,
  port 3080 or a user tmux server.
