# Homebrew Cask for Dogwalker (macOS, arm64).
#
# Publish this in a tap repo named `homebrew-dogwalker` (path Casks/dogwalker.rb):
#   brew tap caribeedu/dogwalker && brew install --cask dogwalker
#
# Per release: bump `version` and set `sha256` to the DMG's hash, e.g.
#   shasum -a 256 Dogwalker-<version>-arm64.dmg
# (or run `brew bump-cask-pr` in the tap once it's set up).
cask "dogwalker" do
  version "1.5.0"
  sha256 "REPLACE_WITH_DMG_SHA256"

  url "https://github.com/caribeedu/dogwalker/releases/download/v#{version}/Dogwalker-#{version}-arm64.dmg"
  name "Dogwalker"
  desc "Infinite canvas for AI coding agents"
  homepage "https://github.com/caribeedu/dogwalker"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "Dogwalker.app"

  # Not code-signed yet — clear the quarantine flag so Gatekeeper allows launch.
  caveats <<~EOS
    Dogwalker is not notarized yet. If macOS blocks the first launch, run:
      xattr -dr com.apple.quarantine "#{appdir}/Dogwalker.app"
  EOS
end
