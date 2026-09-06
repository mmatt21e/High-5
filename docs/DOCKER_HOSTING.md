# Docker hosting

Five-O Poker can run in one of three mutually exclusive Docker Compose modes.
No public mode is enabled merely by checking out or building this repository.

| Mode | Listener | Intended use |
|---|---|---|
| `Local` | `127.0.0.1:3000` by default | Private use on the Docker host |
| `Caddy` | Public TCP 80/443 and UDP 443 | Direct hosting with DNS and router port forwarding |
| `Tunnel` | No inbound host ports | Public hosting through a remotely managed Cloudflare Tunnel |

All modes run exactly one application replica and store SQLite, including its
WAL sidecars, in the `five-o-poker-data` Docker volume. The migration job and
application share the same image and volume. The application container is not
published to the Internet in either public mode.

## Requirements

- Docker Desktop with Docker Compose v2
- PowerShell 7 or Windows PowerShell 5.1
- Free local TCP port 3000, or another port selected in `deploy/docker.env`
- For public hosting, a hostname that you control

Run all commands from the repository root.

## Local quick start

```powershell
.\deploy\Initialize-DockerEnv.ps1
.\deploy\Start-Docker.ps1 -Mode Local
```

Open `http://localhost:3000`. The initializer creates the ignored
`deploy/docker.env` file and writes a random 32-byte Auth.js secret without
displaying it. It will not overwrite that file unless explicitly run with
`-Force`. That switch rotates only `AUTH_SECRET` and preserves the other
settings; changing the secret signs out existing sessions.

To use another host port, edit both of these values before starting:

```dotenv
FIVEO_LOCAL_PORT=3100
AUTH_URL=http://localhost:3100
```

The local Compose overlay derives the running application's origin from
`FIVEO_LOCAL_PORT`; keeping `AUTH_URL` aligned makes the base configuration and
manual commands unambiguous.

## Routine operation

The start script validates the selected Compose model, builds the application
image, checks the complete production environment before downtime, stops the
sole database writer and any prior-mode gateway, applies guarded Prisma
migrations, starts the app, waits for `/api/health`, and only then starts and
verifies the selected gateway. It uses `COMPOSE_PROJECT_NAME` to avoid touching
unrelated Compose projects, and it never removes named volumes.

Rebuild and apply an update:

```powershell
.\deploy\Start-Docker.ps1 -Mode Local
```

Skip the image build only when the current image already contains the desired
source and build-time configuration:

```powershell
.\deploy\Start-Docker.ps1 -Mode Local -SkipBuild
```

Inspect status and logs in local mode:

```powershell
docker compose --env-file deploy/docker.env -f compose.yaml -f compose.local.yaml ps
docker compose --env-file deploy/docker.env -f compose.yaml -f compose.local.yaml logs --tail 100 -f app
```

For a public mode, substitute `compose.public.yaml` or
`compose.tunnel.yaml`. Stop every container in this project's Compose project
without deleting its data or gateway volumes:

```powershell
.\deploy\Stop-Docker.ps1
```

Do not add a second app replica. Active game coordination, locks, and backstop
rate limits are process-local even though completed state is durable in SQLite.

## Persistence and backups

The named data volume survives container recreation, image rebuilds, mode
changes, and `Stop-Docker.ps1`. Never use `docker compose down --volumes` unless
you intend to erase the database. Inspect the volume with:

```powershell
docker volume inspect five-o-poker-data
```

For a consistent backup, stop the app writer and copy the complete `/data`
directory before restarting it. This captures the database and any SQLite
sidecars together:

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force backups | Out-Null
docker compose --env-file deploy/docker.env -f compose.yaml -f compose.local.yaml stop app
docker compose --env-file deploy/docker.env -f compose.yaml -f compose.local.yaml cp app:/data ".\backups\five-o-data-$stamp"
.\deploy\Start-Docker.ps1 -Mode Local -SkipBuild
```

Use the overlay for the active mode. Test restoration from backups separately;
a backup that has never been restored is not a verified recovery plan.

## Public option A: Caddy and direct port forwarding

Use this mode only when the host has a reachable public address and the router
can forward inbound traffic.

1. Create an `A` record (and an `AAAA` record only if IPv6 routing is correct)
   for the future hostname so it resolves to the home Internet connection.
2. If the public IP changes, configure a dynamic-DNS updater for that record.
3. Forward public TCP 80 and TCP 443 to the Docker host. UDP 443 is optional but
   enables HTTP/3. Permit those ports in the host firewall.
4. Set `PUBLIC_HOSTNAME` in `deploy/docker.env` to the hostname only, such as
   `play.example.com`. Do not include `https://`, a port, path, or trailing slash.
5. Start the public stack:

```powershell
.\deploy\Start-Docker.ps1 -Mode Caddy
```

Caddy obtains and renews HTTPS certificates, redirects HTTP to HTTPS, compresses
responses, proxies Socket.IO WebSocket upgrades, and actively checks the app's
health endpoint. Its HSTS policy is deliberately limited to the selected host;
it does not preload or claim every subdomain. Port 3000 remains Docker-internal.
The launcher verifies Caddy's internal proxy path, but you must still test DNS,
certificate issuance, firewall rules, and reachability from an external network.

Certificate issuance requires working public DNS and reachability on the
required ports. Carrier-grade NAT commonly prevents direct forwarding; use the
tunnel option in that case. Configure any alias hostnames as redirects at the
edge so every browser uses the one canonical `PUBLIC_HOSTNAME`.

## Public option B: Cloudflare Tunnel

Tunnel mode makes an outbound connection and opens no inbound host ports. It is
usually the simpler option behind carrier-grade NAT or when router port
forwarding is undesirable.

1. Add the domain to Cloudflare and create a remotely managed tunnel.
2. Add a public-hostname route whose service URL is exactly
   `http://app:3000`. `app` is resolvable inside the Compose network.
3. Copy Cloudflare's connector command, then import only its token into the
   ignored, access-restricted secret file:

```powershell
.\deploy\Import-CloudflareTunnelToken.ps1
```

   The helper accepts Cloudflare's Windows service command, Docker command, or
   a bare token. It never prints the token.
4. Set the same hostname in `PUBLIC_HOSTNAME` in `deploy/docker.env`.
5. Start the tunnel stack:

```powershell
.\deploy\Start-Docker.ps1 -Mode Tunnel
```

The token is mounted as a Compose secret and read through
`TUNNEL_TOKEN_FILE`; it is not placed in the image or environment file. In
Cloudflare, keep WebSockets enabled and bypass cache for `/api/*`, `/sw.js`,
HTML documents, and Next.js RSC responses. Do not configure the tunnel to a
host-published port—the intended origin is the internal `app:3000` service.
Startup waits for cloudflared's readiness endpoint to confirm an edge connection;
still test the configured public route from outside the local network.

## Canonical URL and optional integrations

Public mode forces `AUTH_URL=https://PUBLIC_HOSTNAME`. Socket.IO also checks the
browser Origin against that exact value. Once public mode is active, use the
HTTPS hostname from both inside and outside the home network; direct LAN HTTP
addresses are not an authenticated fallback because production sessions use
secure cookies. Configure router hairpin NAT or split DNS if local clients
cannot reach the public hostname.

For Google OAuth, register this exact callback after the hostname is selected:

```text
https://PUBLIC_HOSTNAME/api/auth/callback/google
```

Then set `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and
`NEXT_PUBLIC_GOOGLE_ENABLED=true`. The Google flag and
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` are compiled into the browser bundle, so changing
either requires a rebuild (run `Start-Docker.ps1` without `-SkipBuild`).

## Public-access security boundary

A hard-to-guess hostname is not access control. Anyone who learns the address
can reach the sign-in page, and the current product permits public account
registration. Authenticated game access and invite codes still apply inside the
application. Never publish port 3000 or forward it around Caddy or the tunnel.

Before broadly advertising the service, plan a separate public-release
hardening pass for the desired audience. Open items include choosing a
registration policy, email verification and account recovery, consistent
same-origin checks on state-changing HTTP routes, and source-IP rate limits at
the edge for registration, authentication, and realtime handshakes. A strict
Content Security Policy also needs a nonce-based design because the application
has an inline appearance bootstrap and Next.js runtime scripts; do not paste in
a blanket CSP that breaks startup. These are explicit release decisions, not
silently enabled assumptions in the Docker stack.

No public address, DNS record, router rule, Cloudflare route, or tunnel is
created by this repository. Public exposure begins only after the hostname and
one public mode are deliberately configured and started.
