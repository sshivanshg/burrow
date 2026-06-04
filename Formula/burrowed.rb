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
  version "0.2.5"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sshivanshg/burrow/releases/download/v#{version}/burrow-darwin-arm64"
      sha256 "94a18d7bc654ccb3a2c5fdeb2c23538a9fef219760e1e182db7acc17282b3344"
    else
      url "https://github.com/sshivanshg/burrow/releases/download/v#{version}/burrow-darwin-x64"
      sha256 "cf66b58fb02953f6cd2917ad34d8aa09dfd3bb55ec2815d2f341f117bbf5b304"
    end
  end

  def install
    bin.install Dir["*"].first => "burrow"
  end

  test do
    assert_match "burrow", shell_output("#{bin}/burrow --help")
  end
end
