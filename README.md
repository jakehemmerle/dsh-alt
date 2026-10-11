# dsh-alt

macOS-style Option/Alt word editing for the dsh-TUI prompt (`dst`).

dsh-TUI 0.14.0 gets two things wrong with "Use Option as Meta" terminals
(Terminal.app, iTerm2, Ghostty with `macos-option-as-alt`, tmux):

- **Option+Backspace clears the whole draft.** The terminal sends `ESC DEL`.
  dsh-TUI's tokenizer (`ink/termio/tokenize.js`) only pairs ESC with final
  bytes 0x30–0x7e (plus CR/LF), so `ESC DEL` falls through as text and is
  split into Escape + Backspace. Escape on a non-empty prompt clears it.
- **Option+Left/Right move one character.** They parse as `leftArrow`/
  `rightArrow` with `meta`, but `PromptInput` only takes its word-jump branch
  for `isMod(key)` (Ctrl, or Cmd on macOS).

The plugin wraps `tty.ReadStream#read` (dsh-TUI reads stdin in the same
process) and rewrites, outside bracketed paste:

| Keys | Sequences | Becomes |
| --- | --- | --- |
| Option+Backspace | `ESC DEL`, `ESC BS` | Ctrl+W (delete previous word) |
| Option+Left | `CSI 1;3D`, `ESC b`, `ESC ESC [D` | Ctrl+Left (word left) |
| Option+Right | `CSI 1;3C`, `ESC f`, `ESC ESC [C` | Ctrl+Right (word right) |

The first screen (Launchpad) is a separate single-line editor that ignores
those Ctrl bindings; `pkgs/dsh-tui/launchpad-word-edit.patch` adds them there.

Set the row's `config.enabled: false` to turn it off. Tests: `node --test
test/*.test.js`; set `DSH_TUI_TYPES=<dsh-tui>/lib/types` to also check the
result against dsh-TUI's own key parser.
