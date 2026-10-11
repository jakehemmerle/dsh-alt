# dsh-alt specification

Every property below has a stable ID. Tests cite these IDs in their names, and
[TESTING.md](TESTING.md) maps each ID to its tests and latest result. Sources: README.md,
the original test file, code comments in `index.js` / `lib/translate.js`, the
nix-config `launchpad-word-edit.patch`, and the October 2026 audit findings.

## Product

**Problem.** Terminals that send Option as Meta (Terminal.app, iTerm2, Ghostty with
`macos-option-as-alt`, tmux) deliver Option+Backspace as `ESC DEL` and Option+arrows as
`ESC b`/`ESC f`, `CSI 1;3D/C` or `ESC ESC [D/C`. dsh-TUI 0.14.0 splits `ESC DEL` into
Escape (which clears a non-empty draft) + Backspace, and moves Option+arrows by one
character, because only Ctrl/Cmd takes its word-jump branch.

**Outcome.** In dsh-TUI's prompt editors, Option+Backspace deletes the previous word and
Option+Left/Right jump by word, exactly like Ctrl+W / Ctrl+Left / Ctrl+Right, on both the
**Launchpad** (first prompt) and the **in-chat prompt** (follow-up prompts).

**Mechanism.** A host plugin wraps `tty.ReadStream.prototype.read` (dsh-TUI reads stdin
in the DSH process) and rewrites, outside bracketed paste:

| Keys | Sequences | Becomes |
| --- | --- | --- |
| Option+Backspace | `ESC DEL`, `ESC BS` | Ctrl+W `0x17` |
| Option+Left | `CSI 1;3D`, `ESC b`, `ESC ESC [D` | Ctrl+Left `CSI 1;5D` |
| Option+Right | `CSI 1;3C`, `ESC f`, `ESC ESC [C` | Ctrl+Right `CSI 1;5C` |

The Launchpad is a separate single-line editor that ignores those Ctrl bindings in stock
dsh-TUI 0.14.0; nix-config's `launchpad-word-edit.patch` (vendored in
[`patches/`](patches/)) adds them there, and this repo's flake builds the pinned dsh-TUI
with that patch so both editors are tested against the same build.

**Word rule** (both editors, readline whitespace rule): delete-word removes trailing
whitespace before the caret then the run of non-whitespace before it; word-left moves the
caret over whitespace then non-whitespace to the left; word-right moves over
non-whitespace then whitespace to the right.

**Non-goals.** No new key bindings, no web UI, no configuration other than `enabled`.
Remove the plugin once dsh-TUI handles `ESC DEL` and meta+arrows itself
(upstream report: ccch1mneyyy/dsh-TUI#1448).

**Configuration.** Row config `{ enabled?: boolean }`; `enabled: false` turns it off.

### Surfaces

| Surface | Applies | Rationale |
| --- | --- | --- |
| dsh-TUI Launchpad | yes | first prompt editor (needs the vendored Launchpad patch) |
| dsh-TUI chat prompt | yes | follow-up prompt editor |
| dsh web | **not applicable** | The browser composer receives keys from the browser, not from a tty in the DSH process; Option/Alt editing there is the browser's own text-field behaviour. dsh-alt has no web client half and none will be built. Required instead: an **inertness** property (P-14). |
| headless | not applicable | no interactive key input |

### Versions (pinned)

DSH `0.2.1-alpha.2` (nix-dsh `f0ca0d745df8cbe99bad91d59153dbd690ae6660`, the rev nix-config
pins) and dsh-TUI `0.14.0` (npm `@deepseek-harness-tui/dsh-tui`), the fleet's versions under
the temporary alpha exception. The plugin imports no DSH package, so it has no peer
dependency; the tested pair is recorded in CHANGELOG.md and TESTING.md.

## Acceptance properties

"Core" means the translator / wrapper running in Node with no DSH; "TUI-L" and "TUI-C" are
a real dsh-TUI process (Launchpad, chat) in a private tmux socket; "Web" is a real
`dsh web` in Chromium.

| ID | Property | Independent oracle | Surfaces |
| --- | --- | --- | --- |
| P-01 | Option+Backspace (`ESC DEL`, `ESC BS`) becomes Ctrl+W and deletes the previous word; the draft is never cleared by it. | Core: output bytes equal `0x17`. TUI: rendered draft equals the word-rule model after each step; the submitted prompt in the mock request equals the model draft. | Core, TUI-L, TUI-C |
| P-02 | Option+Left (all three encodings) becomes Ctrl+Left and moves the caret one word left. | Core: `CSI 1;5D`. TUI: next typed character lands at the model caret. | Core, TUI-L, TUI-C |
| P-03 | Option+Right (all three encodings) becomes Ctrl+Right and moves the caret one word right. | Core: `CSI 1;5C`. TUI: as P-02. | Core, TUI-L, TUI-C |
| P-04 | Everything that is not one of the eight sequences passes through byte-identical: text (incl. Unicode), lone Escape, plain arrows, Backspace, Ctrl forms, `ESC ESC`, `bf`. In the TUI, plain typing/arrows/Backspace with the plugin loaded behave as the stock editor. | Core: an independent regex model of the rule table. TUI: draft model. | Core, TUI-L, TUI-C |
| P-05 | Bracketed paste (`ESC[200~` … `ESC[201~`) is passed through byte-identical, markers included, even when the body contains Option sequences. | Core: model. TUI: pasted text appears verbatim in the draft. | Core, TUI-L, TUI-C |
| P-06 | **Chunk independence:** for any input and any split of it into reads, the concatenated output (after held bytes are released) equals the output for the input as one read. | Core: model applied to the whole input. TUI: an Option sequence written in two writes < 50 ms apart still edits by word. | Core, TUI-L, TUI-C |
| P-07 | A paste-start marker split across reads still starts paste mode: the paste body is not rewritten. | Core: model. | Core |
| P-08 | A paste-end marker split across reads still ends paste mode: Option sequences after the paste are translated again (the plugin does not silently stop). | Core: model; TUI: Option+Backspace works after a paste. | Core, TUI-C |
| P-09 | Buffer reads (no stream encoding) preserve every byte that is not part of a rewritten sequence, including UTF-8 code points split across reads and invalid UTF-8. | Core: byte comparison with the model on latin1. | Core |
| P-10 | **Liveness:** bytes held because they could start a sequence (e.g. a lone Escape) are released unchanged within 50 ms outside paste (500 ms inside paste, dsh-TUI's own paste timeout); nothing is lost or duplicated. In the TUI a lone Escape still clears a non-empty draft. | Core: fake readable stream + timers; TUI: Escape clears the rendered draft. | Core, TUI-L, TUI-C |
| P-11 | **Parser contract:** dsh-TUI 0.14.0's own key parser reads each translation as the bound key (Ctrl+W with `escape: false`, Ctrl+Left, Ctrl+Right). Required in every run, including the Nix build; a missing dsh-TUI is a failure, not a skip. | dsh-TUI `parseMultipleKeypresses` + `InputEvent`. | Core (contract) |
| P-12 | **Lifecycle:** `apply` installs exactly one wrapper on `tty.ReadStream.prototype.read`; disposing restores the original (and releases held bytes); `enabled: false` installs nothing; each stream has independent state. | Core: prototype identity, a real plugin context. | Core |
| P-13 | **Launchpad patch contract:** the vendored `launchpad-word-edit.patch` applies to the pinned dsh-TUI 0.14.0 and its Launchpad implements the word rule for Ctrl+W/Ctrl+Left/Ctrl+Right. | Nix build (patch applies) + TUI-L properties above. | TUI-L |
| P-14 | **Web inertness:** with dsh-alt loaded into a real `dsh web` profile, the plugin loads without warnings, the page has no errors, and composer typing (including Alt/Option chords and Backspace) yields the same text as the browser's own model; a submitted prompt reaches the mock model exactly once and verbatim. | Playwright DOM + mock request log. | Web |
| P-15 | **Prompt fidelity:** in chat and on the Launchpad, the prompt sent to the model after Enter equals the model draft (no translated byte leaks into the prompt, no draft loss). | Mock request log. | TUI-L, TUI-C |

### Generated action model (TUI)

Actions: type a word/space/Unicode text, Backspace, Left, Right, Option+Backspace /
Option+Left / Option+Right in any of their encodings (single write or split into two
writes), Ctrl+W, bracketed paste of text that may contain Option sequences. The model is a
`(draft, caret)` pair updated by the word rule; after **every** action the rendered prompt
must equal the model draft. Sequences end with Enter and the mock request must contain the
draft (P-15). Seeds are logged; `FC_SEED`, `FC_PATH` and `NUM_RUNS` replay a run.
