// Resolves dsh-TUI's lib/types for the parser-contract test (SPEC.md P-11).
// DSH_TUI_TYPES wins; otherwise DSH_TUI_DIR/lib/types (the rig's mounting
// convention). No silent skip: per SPEC.md P-11 a missing dsh-TUI is a
// failure, so resolveTuiTypes() throws with instructions instead of skipping.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function resolveTuiTypes() {
  const candidates = [];
  if (process.env.DSH_TUI_TYPES) candidates.push(process.env.DSH_TUI_TYPES);
  if (process.env.DSH_TUI_DIR) candidates.push(join(process.env.DSH_TUI_DIR, 'lib', 'types'));
  for (const dir of candidates) {
    if (existsSync(join(dir, 'ink', 'parse-keypress.js'))) return dir;
  }
  throw new Error(
    'P-11: dsh-TUI key-parser types not found; a missing dsh-TUI is a failure, not a skip. '
    + 'Set DSH_TUI_TYPES=<dsh-tui>/lib/types (or DSH_TUI_DIR=<dsh-tui package dir>), '
    + 'or run the suites from the Nix env (nix develop) or the real-client app (nix run .#e2e).',
  );
}
