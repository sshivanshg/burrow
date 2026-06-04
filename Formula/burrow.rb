# Homebrew tap formula for burrow.
#
# Usage:
#   brew tap sshivanshg/burrow https://github.com/sshivanshg/burrow
#   brew install burrow
#
# This formula downloads the pre-built binary attached to the GitHub
# release. The release workflow attaches darwin-arm64 + darwin-x64
# binaries and updates the URLs/sha256 below on tag push.
class Burrow < Formula
  desc "Dig out junk and reclaim disk space — Mac cleaner with terminal animations"
  homepage "https://github.com/sshivanshg/burrow"
  version "0.2.4"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sshivanshg/burrow/releases/download/v#{version}/burrow-darwin-arm64"
      sha256 "b737674bc85e96162444e606a3e75ec9a2f743bf1149e16345dad1b56f9251db"
    else
      url "https://github.com/sshivanshg/burrow/releases/download/v#{version}/burrow-darwin-x64"
      sha256 "384c8e934f000a54e6abbefc457c574f1e2350b2fc0622f8f5bd19ad47cc2d84"
    end
  end

  def install
    bin.install Dir["*"].first => "burrow"
  end

  test do
    assert_match "burrow", shell_output("#{bin}/burrow --help")
  end
end
