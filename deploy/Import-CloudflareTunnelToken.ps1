[CmdletBinding()]
param(
    [string]$DestinationPath = (Join-Path $PSScriptRoot "cloudflare-tunnel-token.txt")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Get-Command Get-Clipboard -ErrorAction SilentlyContinue)) {
    throw "Get-Clipboard is unavailable. Copy only the Cloudflare tunnel token into the destination file manually."
}

$clipboardText = Get-Clipboard -Raw
if ([string]::IsNullOrWhiteSpace($clipboardText)) {
    throw "The clipboard is empty. Use Cloudflare's connector-command copy button, then try again."
}

$commandMatch = [regex]::Match(
    $clipboardText,
    '(?i)(?:service\s+install|--token)\s+(?<token>[A-Za-z0-9_-]{100,}={0,2})(?:\s|$)'
)
$token = if ($commandMatch.Success) {
    $commandMatch.Groups['token'].Value
} else {
    $clipboardText.Trim()
}

if ($token -notmatch '^[A-Za-z0-9_-]{100,}={0,2}$') {
    throw "The clipboard does not contain a recognizable Cloudflare tunnel token or connector command."
}

$resolvedDestination = [IO.Path]::GetFullPath($DestinationPath)
$destinationDirectory = Split-Path -Parent $resolvedDestination
if (-not (Test-Path -LiteralPath $destinationDirectory -PathType Container)) {
    throw "The destination directory does not exist: $destinationDirectory"
}

$utf8WithoutBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($resolvedDestination, $token + [Environment]::NewLine, $utf8WithoutBom)

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $resolvedDestination '/inheritance:r' '/grant:r' "${currentIdentity}:(F)" 'SYSTEM:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "The token was written, but its Windows file permissions could not be restricted."
}

Write-Host "Cloudflare tunnel token imported and restricted to the current user and SYSTEM."
