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
  version "0.3.1"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sshivanshg/burrowed/releases/download/v#{version}/burrowed-darwin-arm64"
      sha256 "ee5696d0d0eeea45a857b4e50541d4ad1f0ad1eee5390b7ea3b7edaf47b87c25"
    else
      url "https://github.com/sshivanshg/burrowed/releases/download/v#{version}/burrowed-darwin-x64"
      sha256 "7a8cbbb4f962217a19a70ba12ea7c4ef912c6f84fad281cf2e5a5d9c905f39e6"
    end
  end

  def install
    bin.install Dir["*"].first => "burrowed"
  end

  test do
    assert_match "burrowed", shell_output("#{bin}/burrowed --help")
  end
end
