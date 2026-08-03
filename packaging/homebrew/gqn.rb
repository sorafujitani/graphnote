# Homebrew formula for the graphnote CLI.
#
# Homebrew needs a tap repository, which lives outside this repo:
#
#   gh repo create sorafujitani/homebrew-tap --public --clone
#   cp packaging/homebrew/gqn.rb ../homebrew-tap/Formula/gqn.rb
#   cd ../homebrew-tap && git add Formula/gqn.rb && git commit -m "Add gqn" && git push
#
#   brew install --HEAD sorafujitani/tap/gqn
#
# HEAD-only on purpose: there is no tagged release yet, so there is no artifact
# to pin a sha256 against. After tagging vX.Y.Z, add a stable block:
#
#   url "https://github.com/sorafujitani/graphnote/archive/refs/tags/vX.Y.Z.tar.gz"
#   sha256 "<shasum -a 256 of that tarball>"
#
# Users who do not want a tap can install the same bundle directly:
#
#   curl -fsSL https://graphnote.app/install.sh | sh
class Gqn < Formula
  desc "CLI for graphnote — personal graph notes on Cloudflare Workers"
  homepage "https://graphnote.app"
  license "MIT"
  head "https://github.com/sorafujitani/graphnote.git", branch: "main"

  depends_on "node"
  depends_on "pnpm" => :build

  def install
    system "pnpm", "install", "--frozen-lockfile", "--ignore-scripts"
    system "pnpm", "run", "build:cli"

    # The bundle is ESM: keep the .mjs extension so node does not treat it as CJS.
    libexec.install "dist/cli/gqn.js" => "gqn.mjs"
    (bin/"gqn").write <<~SH
      #!/bin/sh
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/gqn.mjs" "$@"
    SH
  end

  test do
    assert_match "CLI for graphnote", shell_output("#{bin}/gqn --help")
  end
end
