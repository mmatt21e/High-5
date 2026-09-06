[CmdletBinding()]
param(
    [ValidateSet("Local", "Caddy", "Tunnel")]
    [string]$Mode = "Local",

    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $PSScriptRoot "docker.env"
$baseComposePath = Join-Path $repositoryRoot "compose.yaml"

function Get-DotEnvValue {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$Name
    )

    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }

    return $null
}

function Invoke-Docker {
    param([Parameter(Mandatory)] [string[]]$Arguments)

    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed with exit code $LASTEXITCODE."
    }
}

function Wait-DockerServiceHealthy {
    param(
        [Parameter(Mandatory)] [string[]]$ComposeArguments,
        [Parameter(Mandatory)] [string]$Service,
        [int]$TimeoutSeconds = 120
    )

    $containerIds = @(& docker @($ComposeArguments + @("ps", "-q", $Service)))
    $containerIds = @($containerIds | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($LASTEXITCODE -ne 0 -or $containerIds.Count -ne 1) {
        throw "Expected exactly one running $Service container; found $($containerIds.Count)."
    }
    $containerId = $containerIds[0].Trim()

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $health = "starting"
    while ([DateTime]::UtcNow -lt $deadline) {
        $healthOutput = & docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $containerId 2>$null
        if ($LASTEXITCODE -ne 0) {
            $health = "missing"
            break
        }
        $health = ([string]$healthOutput).Trim()
        if ($health -eq "healthy") {
            return
        }
        if ($health -in @("unhealthy", "exited", "dead")) {
            break
        }
        Start-Sleep -Seconds 2
    }

    & docker @($ComposeArguments + @("logs", "--tail", "100", $Service))
    throw "The $Service service did not become healthy (last state: $health)."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker was not found. Install and start Docker Desktop, then try again."
}

if (-not (Test-Path -LiteralPath $environmentPath)) {
    & (Join-Path $PSScriptRoot "Initialize-DockerEnv.ps1")
    if (-not (Test-Path -LiteralPath $environmentPath)) {
        throw "deploy/docker.env was not created."
    }
}

$projectName = Get-DotEnvValue -Path $environmentPath -Name "COMPOSE_PROJECT_NAME"
if ([string]::IsNullOrWhiteSpace($projectName)) {
    $projectName = "five-o-poker"
}
if ($projectName -notmatch "^[a-z0-9][a-z0-9_-]*$") {
    throw "COMPOSE_PROJECT_NAME must contain only lowercase letters, digits, hyphens, and underscores."
}

$authSecret = Get-DotEnvValue -Path $environmentPath -Name "AUTH_SECRET"
if (
    [string]::IsNullOrWhiteSpace($authSecret) -or
    $authSecret.Length -lt 32 -or
    $authSecret -eq "__GENERATED_AUTH_SECRET__"
) {
    throw "AUTH_SECRET in deploy/docker.env must be a non-placeholder value of at least 32 characters."
}

$localPortText = Get-DotEnvValue -Path $environmentPath -Name "FIVEO_LOCAL_PORT"
if ([string]::IsNullOrWhiteSpace($localPortText)) {
    $localPortText = "3000"
}
$localPort = 0
if (-not [int]::TryParse($localPortText, [ref]$localPort) -or $localPort -lt 1 -or $localPort -gt 65535) {
    throw "FIVEO_LOCAL_PORT must be an integer from 1 through 65535."
}

$overlayName = switch ($Mode) {
    "Local" { "compose.local.yaml" }
    "Caddy" { "compose.public.yaml" }
    "Tunnel" { "compose.tunnel.yaml" }
}
$overlayPath = Join-Path $repositoryRoot $overlayName

$publicHostname = $null
if ($Mode -ne "Local") {
    $publicHostname = Get-DotEnvValue -Path $environmentPath -Name "PUBLIC_HOSTNAME"
    if ([string]::IsNullOrWhiteSpace($publicHostname)) {
        throw "Set PUBLIC_HOSTNAME in deploy/docker.env before starting a public mode."
    }
    if ([Uri]::CheckHostName($publicHostname) -ne [UriHostNameType]::Dns) {
        throw "PUBLIC_HOSTNAME must be a DNS hostname only, without a scheme, port, path, or trailing slash."
    }
}

if ($Mode -eq "Tunnel") {
    $tokenPathValue = Get-DotEnvValue -Path $environmentPath -Name "CLOUDFLARE_TUNNEL_TOKEN_FILE"
    if ([string]::IsNullOrWhiteSpace($tokenPathValue)) {
        throw "Set CLOUDFLARE_TUNNEL_TOKEN_FILE in deploy/docker.env."
    }
    $tokenPath = if ([IO.Path]::IsPathRooted($tokenPathValue)) {
        $tokenPathValue
    } else {
        Join-Path $repositoryRoot $tokenPathValue
    }
    $tokenPath = [IO.Path]::GetFullPath($tokenPath)
    if (-not (Test-Path -LiteralPath $tokenPath -PathType Leaf)) {
        throw "Cloudflare tunnel token file was not found: $tokenPath"
    }
    if ([string]::IsNullOrWhiteSpace([IO.File]::ReadAllText($tokenPath))) {
        throw "The Cloudflare tunnel token file is empty."
    }
}

$compose = @(
    "compose",
    "--project-name", $projectName,
    "--env-file", $environmentPath,
    "-f", $baseComposePath,
    "-f", $overlayPath
)

Push-Location $repositoryRoot
try {
    Invoke-Docker -Arguments ($compose + @("config", "--quiet"))

    if (-not $SkipBuild) {
        Invoke-Docker -Arguments ($compose + @("build", "app"))
    }

    # Validate the environment from the exact image and selected overlay before
    # taking the currently running service offline.
    Invoke-Docker -Arguments ($compose + @(
        "run", "--rm", "--no-deps", "app", "npm", "run", "env:check"
    ))

    # Stop the only database writer and remove any gateway left by a previous
    # mode before migration. Named volumes are intentionally retained.
    Invoke-Docker -Arguments ($compose + @("down", "--remove-orphans"))
    Invoke-Docker -Arguments ($compose + @("run", "--rm", "--no-deps", "migrate"))
    Invoke-Docker -Arguments ($compose + @("up", "-d", "--no-deps", "app"))
    Wait-DockerServiceHealthy -ComposeArguments $compose -Service "app"

    $gatewayService = $null
    if ($Mode -eq "Caddy") {
        $gatewayService = "caddy"
    } elseif ($Mode -eq "Tunnel") {
        $gatewayService = "tunnel"
    }
    if ($null -ne $gatewayService) {
        Invoke-Docker -Arguments ($compose + @(
            "up", "-d", "--no-deps", "--remove-orphans", $gatewayService
        ))
        Wait-DockerServiceHealthy -ComposeArguments $compose -Service $gatewayService
    }

    $url = if ($Mode -eq "Local") {
        "http://localhost:$localPort"
    } else {
        "https://$publicHostname"
    }

    if ($Mode -eq "Local") {
        Write-Host "Five-O Poker is healthy in Local mode: $url"
    } else {
        Write-Host "Five-O Poker and its $Mode gateway are ready: $url"
        Write-Host "Confirm external DNS, TLS, and reachability from outside the local network."
    }
} finally {
    Pop-Location
}
