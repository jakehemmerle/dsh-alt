{ lib, buildNpmPackage, fetchurl, jq, runCommand, pluginSrc }:

# dsh-TUI 0.14.0 as dsh-alt tests it: the pinned npm release with ONLY the
# vendored launchpad-word-edit.patch (the half of dsh-alt that lives in
# dsh-TUI, SPEC.md P-13). The src preparation and npmDepsHash are nix-config's
# pkgs/dsh-tui.nix at 6a7e6130, so the npm layer is bit-identical to the
# fleet's build; the fleet derivation applies more patches on top (omp-keys,
# model-selector-scene, preset-schedule-deny, launchpad-status, dsh-speed's
# patch-tui). To qualify against that exact build instead, point DSH_TUI_DIR
# at it (TESTING.md).
let
  version = "0.14.0";
  tarball = fetchurl {
    url = "https://registry.npmjs.org/@deepseek-harness-tui/dsh-tui/-/dsh-tui-${version}.tgz";
    hash = "sha512-syU0CLbAoxA97URyhnPFiLbWm3dXrmCR5NCO6mFovRi7mebX2HeEYdhpugEoT9vZ1vpUfE/+uX7xrs6zOGUJ1g==";
  };
  # npm ci empties node_modules, so the bundled @dsh-std and @dsh-tui-vendor
  # packages are taken out of the manifest and restored after installation.
  unlistedPeers = [
    "@deepseek-ai/cordis-plugin-include"
    "@deepseek-ai/dsh-agent-preset"
    "@deepseek-ai/dsh-attachment-local"
    "@deepseek-ai/dsh-mcp-client"
    "@deepseek-ai/dsh-session-persistence"
    "@deepseek-ai/dsh-session-persistence-jsonl"
  ];
  src = runCommand "dsh-tui-source-${version}" { nativeBuildInputs = [ jq ]; } ''
    mkdir -p $out
    tar -xzf ${tarball} -C $out --strip-components=1
    jq --argjson names '${builtins.toJSON unlistedPeers}' '
      .peerDependencies += ($names | map({ key: ., value: "*" }) | from_entries)
      | .peerDependenciesMeta += ($names | map({ key: ., value: { optional: true } }) | from_entries)' \
      $out/package.json > $out/package.json.runtime
    jq 'del(.devDependencies, .scripts, .bundledDependencies, .peerDependencies, .peerDependenciesMeta)
      | .optionalDependencies |= with_entries(select(.key | startswith("@dsh-") | not))' \
      $out/package.json.runtime > $out/package.json
    mv $out/node_modules $out/bundled
    cp ${pluginSrc}/patches/dsh-tui-0.14.0-package-lock.json $out/package-lock.json
  '';
in
buildNpmPackage {
  pname = "dsh-tui";
  inherit version src;

  # The Launchpad (first screen) is its own single-line editor that ignores
  # Ctrl+W and Ctrl+Left/Right, which the chat prompt binds and dsh-alt maps
  # Option+Backspace/arrows onto. Drop once dsh-TUI handles word edits there
  # (upstream report: ccch1mneyyy/dsh-TUI#1448).
  patches = [ "${pluginSrc}/patches/launchpad-word-edit.patch" ];

  npmDepsFetcherVersion = 2;
  npmDepsHash = "sha256-EMVmgJJ3sc0iqN+vmW/t6vWtrQWANc50biq6h15XfpA=";
  npmFlags = [ "--legacy-peer-deps" "--ignore-scripts" ];
  dontNpmBuild = true;

  postInstall = ''
    pkg=$out/lib/node_modules/@deepseek-harness-tui/dsh-tui
    cp -r bundled/. $pkg/node_modules/
    cp package.json.runtime $pkg/package.json
    # Its launchers bootstrap and self-update a mutable profile; the profile
    # here is managed, so nix-config supplies the dst launcher instead.
    rm -r $out/bin
  '';

  # The patch applying cleanly (build success) plus the parser contract
  # (SPEC.md P-11) against the exact built artifact: the translations must
  # parse as the bound keys in every run, a missing dsh-TUI is a failure.
  doInstallCheck = true;
  nativeInstallCheckInputs = [ ];
  installCheckPhase = ''
    runHook preInstallCheck
    DSH_TUI_TYPES=$out/lib/node_modules/@deepseek-harness-tui/dsh-tui/lib/types \
      node --test ${pluginSrc}/test/translate.test.js
    runHook postInstallCheck
  '';

  meta = {
    description = "Terminal user interface for DeepSeek Harness (pinned 0.14.0 with the dsh-alt Launchpad patch)";
    homepage = "https://github.com/ccch1mneyyy/dsh-TUI";
    license = lib.licenses.mit;
  };
}
