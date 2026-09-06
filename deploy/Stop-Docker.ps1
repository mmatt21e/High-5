[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $PSScriptRoot "docker.env"
$baseComposePath = Join-Path $repositoryRoot "compose.yaml"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker was not found. Nothing was stopped."
}

if (-not (Test-Path -LiteralPath $environmentPath)) {
    throw "deploy/docker.env does not exist. Nothing was stopped."
}

$projectName = "five-o-poker"
foreach ($line in [IO.File]::ReadAllLines($environmentPath)) {
    if ($line -match "^\s*COMPOSE_PROJECT_NAME\s*=\s*(.*)\s*$") {
        $candidate = $Matches[1].Trim().Trim('"').Trim("'")
        if (-not [string]::IsNullOrWhiteSpace($candidate)) {
            $projectName = $candidate
        }
        break
    }
}
if ($projectName -notmatch "^[a-z0-9][a-z0-9_-]*$") {
    throw "COMPOSE_PROJECT_NAME in deploy/docker.env is invalid. Nothing was stopped."
}

& docker compose `
    --project-name $projectName `
    --env-file $environmentPath `
    -f $baseComposePath `
    down --remove-orphans

if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed with exit code $LASTEXITCODE."
}

Write-Host "Stopped the $projectName containers. Persistent volumes were retained."
