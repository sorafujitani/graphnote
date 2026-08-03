{
  description = "graphnote development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        # nixpkgs pnpm defaults to Node 24; bind it to the same Node 26 as PATH.
        pnpm = pkgs.pnpm.override { nodejs-slim = pkgs.nodejs_26; };
      in
      {
        devShells.default = pkgs.mkShell {
          name = "graphnote";

          packages = [
            pkgs.nodejs_26
            pnpm
            pkgs.git
            pkgs.jq
          ];

          shellHook = ''
            # Keep Nix toolchain ahead of global shims.
            export PATH="${
              pkgs.lib.makeBinPath [
                pkgs.nodejs_26
                pnpm
                pkgs.git
                pkgs.jq
              ]
            }:$PATH"

            # Ensure CLI bundle exists for ./bin/gqn
            if [[ ! -f "$PWD/dist/cli/gqn.js" ]] && [[ -f "$PWD/package.json" ]]; then
              pnpm run build:cli >/dev/null || true
            fi

            echo "graphnote devShell"
            echo "  node: $(node --version)"
            echo "  pnpm: $(pnpm --version)"
          '';
        };

        formatter = pkgs.nixfmt-rfc-style;
      }
    );
}
