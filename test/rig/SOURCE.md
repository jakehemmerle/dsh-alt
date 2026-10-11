# Vendored test rig

`rig.mjs` and `mock-llm.mjs` are copied from Jake's `new-dsh-plugin` skill:

- source: `github.com/jakehemmerle/nix-config` `skills/new-dsh-plugin/scripts/`
- source commit (last change to these files): `2d658d4187ce36db8ff01936620950dc44f760d2`
  (nix-config `main` at copy time: `6a7e6130ea0f45cdf0f3ea51b99565c9264df564`)
- upstream sha256: rig.mjs `4a79aeb02e5c419eb4dbf16396eb0812e1343147ddf1fe084f775c99e0382d93`,
  mock-llm.mjs `a44562f2f5f1754692fcc3f28f5e19d22f83ddf7b98b423ce90ddc607d8695f1`

Tests import these by relative path only (never from `~/.agents` or nix-config).

Local changes to `rig.mjs` (mock-llm.mjs is unchanged):

1. `paths()` requires `DSH_BIN` and takes dsh-TUI only from `DSH_TUI_DIR`; it never falls
   back to `~/.local/share/nix-management/bin/dsh` or `~/.dsh/profiles/dsh-tui`.
   The flake's devShell and `nix run .#e2e` set both to the pinned builds.
2. Every private tmux server starts with `-f /dev/null` (no user tmux.conf).
3. `startTui()` also returns its `tmux` helper so tests can send split writes.
