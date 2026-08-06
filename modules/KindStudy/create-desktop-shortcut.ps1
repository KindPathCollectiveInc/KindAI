# Run this once to add a "KindStudy" icon to your desktop that starts the
# server and opens the dashboard. Re-run any time you move the KindAI folder
# to refresh the shortcut's target.
$ErrorActionPreference = "Stop"

$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath("Desktop")
$Shortcut = $WshShell.CreateShortcut("$Desktop\KindStudy.lnk")
$Shortcut.TargetPath = Join-Path $PSScriptRoot "start-kindstudy.bat"
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.Description = "Start the KindStudy dashboard"
$Shortcut.Save()

Write-Host "Created desktop shortcut: $Desktop\KindStudy.lnk"
Write-Host "Double-click it any time to start KindStudy and open the dashboard."
Write-Host "(Optional: right-click the shortcut -> Properties -> Change Icon... to pick something nicer than the default.)"
