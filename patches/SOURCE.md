# Vendored dsh-TUI build inputs

Copied from `github.com/jakehemmerle/nix-config` (main `6a7e6130ea0f45cdf0f3ea51b99565c9264df564`):

| File here | Source | Last source change |
| --- | --- | --- |
| `launchpad-word-edit.patch` | `pkgs/dsh-tui/launchpad-word-edit.patch` | `50a02afa23f54f23b9101a332fa466f722aaacc9` |
| `dsh-tui-0.14.0-package-lock.json` | `pkgs/dsh-tui/package-lock.json` | see `git log -- pkgs/dsh-tui/package-lock.json` |

`flake.nix` builds dsh-TUI 0.14.0 the way nix-config's `pkgs/dsh-tui.nix` does, applying only
`launchpad-word-edit.patch` (the half of dsh-alt that lives in dsh-TUI). The deployed fleet
build also carries dsh-omp-keys, model-selector-scene, preset-schedule-deny,
launchpad-status and dsh-speed patches; to qualify against that exact build, run the e2e
suites with `DSH_TUI_DIR` pointing at it (see TESTING.md).
