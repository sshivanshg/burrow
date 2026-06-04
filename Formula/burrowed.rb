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
  version "0.3.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sshivanshg/burrow/releases/download/v#{version}/burrow-darwin-arm64"
      sha256 "16c959babc094228b678859c39277fef9f2642e60dc59cebd9c65404de2ede8e"
    else
      url "https://github.com/sshivanshg/burrow/releases/download/v#{version}/burrow-darwin-x64"
      sha256 "4a4409f78716e0693a59d2d1136387254f84ac60bf767bee826165ce9bcb1397"
    end
  end

  def install
    bin.install Dir["*"].first => "burrow"
  end

  test do
    assert_match "burrow", shell_output("#{bin}/burrow --help")
  end
end
