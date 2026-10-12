{ lib, stdenv, nodejs, nodeModules, dshTuiTypes, pluginSrc }:

# The dsh-alt plugin (dependency-free ESM at runtime) with the complete fast
# suite as the build check. The suite needs the fast-check devDependency, so
# node_modules is built from the repo lockfile with importNpmLock and linked
# in for the check only; the installed output stays dependency-free. The
# parser contract (SPEC.md P-11) runs against the pinned dsh-TUI built by
# this flake: a missing dsh-TUI is a failure, not a skip (bead alt-hvt.14).
let
  version = (lib.importJSON (pluginSrc + "/package.json")).version;
in
stdenv.mkDerivation {
  pname = "dsh-alt";
  inherit version;
  src = pluginSrc;

  dontConfigure = true;
  dontBuild = true;

  doCheck = true;
  nativeCheckInputs = [ nodejs ];
  checkPhase = ''
    runHook preCheck
    ln -s ${nodeModules}/node_modules node_modules
    export DSH_TUI_TYPES=${dshTuiTypes}
    node --test --test-concurrency=1 test/*.test.js
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r index.js lib package.json README.md $out/
    runHook postInstall
  '';

  meta = {
    description = "Option/Alt word delete and word jump for dsh-TUI";
    license = lib.licenses.mit;
  };
}