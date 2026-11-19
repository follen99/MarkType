# Prepares a PowerShell session for MarkType development on Windows.
# Usage (dot-source it):  . .\scripts\dev-env.ps1
#
# - Reloads PATH from the registry (tools installed after the shell started become visible).
# - Strips stray double quotes from PATH: on the original dev machine the system PATH contains
#   `C:\Program Files\WSL"`, which makes cmd.exe ignore every later entry, so npm/pnpm scripts
#   fail with "'node' is not recognized".
# - Disables corepack's interactive download prompt.

$env:Path = ([Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')) -replace '"', ''
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
