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
  version "0.1.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sshivanshg/burrow/releases/download/v#{version}/burrow-darwin-arm64"
      sha256 "REPLACE_WITH_ARM64_SHA256_ON_RELEASE"
    else
      url "https://github.com/sshivanshg/burrow/releases/download/v#{version}/burrow-darwin-x64"
      sha256 "REPLACE_WITH_X64_SHA256_ON_RELEASE"
    end
  end

  def install
    bin.install Dir["*"].first => "burrow"
  end

  test do
    assert_match "burrow", shell_output("#{bin}/burrow --help")
  end
end
