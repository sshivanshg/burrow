# Homebrew tap formula for burrowed.
#
# Usage:
#   brew tap sshivanshg/burrowed https://github.com/sshivanshg/burrowed
#   brew install burrowed
#
# This formula downloads the pre-built binary attached to the GitHub
# release. The release workflow attaches darwin-arm64 + darwin-x64
# binaries and updates the URLs/sha256 below on tag push.
class Burrowed < Formula
  desc "Dig out junk and reclaim disk space — Mac cleaner with terminal animations"
  homepage "https://github.com/sshivanshg/burrowed"
  version "0.3.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sshivanshg/burrowed/releases/download/v#{version}/burrowed-darwin-arm64"
      sha256 "16c959babc094228b678859c39277fef9f2642e60dc59cebd9c65404de2ede8e"
    else
      url "https://github.com/sshivanshg/burrowed/releases/download/v#{version}/burrowed-darwin-x64"
      sha256 "4a4409f78716e0693a59d2d1136387254f84ac60bf767bee826165ce9bcb1397"
    end
  end

  def install
    bin.install Dir["*"].first => "burrowed"
  end

  test do
    assert_match "burrowed", shell_output("#{bin}/burrowed --help")
  end
end
