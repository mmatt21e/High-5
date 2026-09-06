[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$templatePath = Join-Path $PSScriptRoot "docker.env.example"
$targetPath = Join-Path $PSScriptRoot "docker.env"

if ((Test-Path -LiteralPath $targetPath) -and -not $Force) {
    Write-Host "Docker environment already exists: $targetPath"
    Write-Host "Use -Force only if you intentionally want a new AUTH_SECRET."
    return
}

if (-not (Test-Path -LiteralPath $templatePath)) {
    throw "Docker environment template was not found: $templatePath"
}

$secretBytes = [byte[]]::new(32)
$randomNumberGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $randomNumberGenerator.GetBytes($secretBytes)
} finally {
    $randomNumberGenerator.Dispose()
}
$secret = [Convert]::ToBase64String($secretBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
$targetExists = Test-Path -LiteralPath $targetPath
if ($targetExists) {
    $contents = [IO.File]::ReadAllText($targetPath)
    $secretPattern = "(?m)^AUTH_SECRET=.*$"
    if (-not [regex]::IsMatch($contents, $secretPattern)) {
        throw "The existing Docker environment does not contain an AUTH_SECRET setting."
    }
    $secretRegex = [regex]::new($secretPattern)
    $contents = $secretRegex.Replace($contents, "AUTH_SECRET=$secret", 1)
} else {
    $contents = [IO.File]::ReadAllText($templatePath)
    if (-not $contents.Contains("__GENERATED_AUTH_SECRET__")) {
        throw "The Docker environment template does not contain the expected secret placeholder."
    }
    $contents = $contents.Replace("__GENERATED_AUTH_SECRET__", $secret)
}
$utf8WithoutBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($targetPath, $contents, $utf8WithoutBom)

if ($targetExists) {
    Write-Host "Rotated AUTH_SECRET in $targetPath; all other settings were preserved."
} else {
    Write-Host "Created Docker environment: $targetPath"
}
Write-Host "The generated AUTH_SECRET was written to that ignored file and was not displayed."
