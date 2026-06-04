# vhs tape for the README animated demo.
# Install vhs: brew install vhs
# Record: vhs docs/demo.tape

Output docs/demo.gif

Set Theme "Catppuccin Mocha"
Set FontSize 16
Set Width 1100
Set Height 700
Set Padding 20

Type "burrow doctor"
Enter
Sleep 3s

Type "clear"
Enter

Type "burrow scan ~/Projects -l"
Enter
Sleep 4s

Type "clear"
Enter

Type "bun run tests/ui.demo.ts"
Enter
Sleep 6s
