{
  description = "dsh-alt: Option/Alt word editing for the dsh-TUI prompt — package, dev shell, fast checks and a real-client e2e app";

  inputs = {
    # nix-config's nixpkgs pin (home/linux.nix nodejs_24 matches this fleet).
    nixpkgs.url = "github:NixOS/nixpkgs/7fc6f2c20af09cdcaf48b92ec3121860139ec668";
    # nix-config's tools pin: carries beads 1.3.0, the fleet's bd.
    nixpkgs-tools.url = "github:NixOS/nixpkgs/b6c8664de9b6cc07fe5666a29f91884ba81197c4";
    # The DSH build nix-config pins (DSH 0.2.1-alpha.2).
    nix-dsh = {
      url = "github:jakehemmerle/nix-dsh/f0ca0d745df8cbe99bad91d59153dbd690ae6660";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, nixpkgs-tools, nix-dsh }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      pluginSrc = self;
      perSystem = forAllSystems (system:
        rec {
          pkgs = nixpkgs.legacyPackages.${system};
          # bd for the work graph (embedded Dolt db); its check suite is
          # nix-config's known 25-minute go test, skipped here like there.
          beads = (nixpkgs-tools.legacyPackages.${system}.beads).overrideAttrs (_: { doCheck = false; });
          dsh = pkgs.callPackage "${nix-dsh}/package.nix" { };
          dsh-tui = pkgs.callPackage ./nix/dsh-tui.nix { inherit pluginSrc; };
          dsh-tui-types = "${dsh-tui}/lib/node_modules/@deepseek-harness-tui/dsh-tui/lib/types";
          dsh-alt = pkgs.callPackage ./nix/dsh-alt.nix {
            inherit pluginSrc;
            nodejs = pkgs.nodejs_24;
            nodeModules = pkgs.importNpmLock.buildNodeModules { npmRoot = pluginSrc; nodejs = pkgs.nodejs_24; };
            dshTuiTypes = dsh-tui-types;
          };
          e2e = pkgs.writeShellScriptBin "dsh-alt-e2e" ''
            export DSH_BIN=${dsh}/bin/dsh
            export DSH_TUI_DIR=${dsh-tui}/lib/node_modules/@deepseek-harness-tui/dsh-tui
            export DSH_TUI_TYPES=${dsh-tui-types}
            export CHROMIUM_PATH=${pkgs.chromium}/bin/chromium
            # Runs the real-client suites from the repo checkout (cwd).
            exec ${pkgs.nodejs_24}/bin/node --test --test-concurrency=1 test/e2e/*.e2e.mjs
          '';
        });
    in
    {
      packages = forAllSystems (system: with perSystem.${system}; {
        inherit dsh dsh-tui;
        default = dsh-alt;
      });

      checks = forAllSystems (system: with perSystem.${system}; {
        # Fast suites P-01..P-12 + the parser contract against the pinned
        # dsh-TUI (SPEC.md P-11).
        plugin = dsh-alt;
        # The vendored Launchpad patch applies to pinned dsh-TUI 0.14.0 and
        # its install check re-runs the parser contract (SPEC.md P-13).
        dsh-tui-patched = dsh-tui;
      });

      devShells = forAllSystems (system: with perSystem.${system}; {
        default = pkgs.mkShell {
          packages = [ pkgs.nodejs_24 pkgs.tmux pkgs.chromium beads dsh dsh-tui ];
          shellHook = ''
            export DSH_BIN=${dsh}/bin/dsh
            export DSH_TUI_DIR=${dsh-tui}/lib/node_modules/@deepseek-harness-tui/dsh-tui
            export DSH_TUI_TYPES=${dsh-tui-types}
            export CHROMIUM_PATH=${pkgs.chromium}/bin/chromium
            echo "dsh-alt dev shell: DSH_BIN=$DSH_BIN"
            echo "dsh-tui (pinned, Launchpad-patched): $DSH_TUI_DIR"
          '';
        };
      });

      apps = forAllSystems (system: with perSystem.${system}; {
        e2e = { type = "app"; program = "${e2e}/bin/dsh-alt-e2e"; };
      });
    };
}