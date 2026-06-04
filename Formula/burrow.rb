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
  version "0.2.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sshivanshg/burrow/releases/download/v#{version}/burrow-darwin-arm64"
      sha256 "0f4e43b649756bfc76e497e4f51b6493b1def8acf315caf65597598d69015f7c"
    else
      url "https://github.com/sshivanshg/burrow/releases/download/v#{version}/burrow-darwin-x64"
      sha256 "0f2f9ebfe90bf933846221a609acd8126e6dccea2fc5c3a69d51b479b32f1e80"
    end
  end

  def install
    bin.install Dir["*"].first => "burrow"
  end

  test do
    assert_match "burrow", shell_output("#{bin}/burrow --help")
  end
end
