# High-5 on Unraid

Activated September 10, 2026 at 11:03 UTC. **Tower is the public data authority.**
Accepted release: `high5-20260910T1050`. Full host reboot passed at 14:28 UTC; soak acceptance remains pending.

## Prepared target

- Origin: `https://edgegames.win`.
- Tower: `192.168.1.50`; controller group `high5`.
- Data: `/mnt/cache/appdata/websites/high5/data`, mounted at `/data`.
- SQLite: `/data/five-o.db`; no separate SQL container is needed.
- Preserved source: `280cb3445b9b59f604c871c769b35121caf86cda`.
- Captured app configuration digest: `sha256:2a7bed6cd1235dd35df9bca5068016366658ded2829e388646fd6d72edcea838`.

This deployment-note commit does not rebuild or release the application. Use the
captured immutable image and the verified Desktop/Tower image identity map.

## Configuration

`compose.json` is a server template with no host-bound app/database ports.
Set `WEBSITE_DATA_ROOT=/mnt/cache/appdata/websites`, `HIGH5_IMAGE`,
`HIGH5_TUNNEL_IMAGE`, `PUBLIC_HOSTNAME` and `AUTH_SECRET` from the reviewed capture.
Preserve existing Google OAuth, VAPID and public feature settings too; defaults
are not permission to discard configured values. Keep resolved Compose, runtime
environment files, tunnel tokens, private keys and data outside Git.

The `tools` profile contains the explicit migration job; `ingress` contains the
connector. Profiles alone do not enforce single-origin authority. Use the central
migration procedure, not a raw Compose `up`, for production activation.

## Operations after explicit activation

On Tower, `/mnt/cache/appdata/websites/control/website-control.sh` supports
`status high5`, `validate high5`, `backup high5`, `stop high5` and `resume high5`.
Stop enters maintenance; resume validates the accepted release and recovery state.
For an already activated group, `deploy high5 <release-id>` stages a reviewed
immutable candidate, then `publish high5` opens ingress after checks. These
commands do not perform the initial PC handover; schema upgrades require their
own validated procedure.

### Shipping a code change

A push to GitHub does **not** update Tower. `.github/workflows/quality.yml`
runs tests, dependency auditing, and Docker packaging checks; it does not upload
an image or invoke the production controller. Container autostart restores the
accepted release after a reboot and does not fetch new code.

For an update, commit and push the reviewed changes, then verify the GitHub
Quality workflow for that exact commit. Build the Docker image on the PC using
the active release's public build arguments, save and transfer it to Tower,
and verify the imported image identity. Prepare a new immutable release manifest
and resolved Compose file by preserving the active release's configuration,
secrets, data mounts, and tunnel image, changing only the app/migration image.
For a release with no schema changes, use `preserve-schema` mode.

Run on Tower, replacing `<release-id>` with that prepared release:

```sh
/mnt/cache/appdata/websites/control/website-control.sh deploy high5 <release-id>
/mnt/cache/appdata/websites/control/website-control.sh publish high5
/mnt/cache/appdata/websites/control/website-control.sh status high5
```

`deploy` stops this group's writers and ingress, creates an encrypted recovery
backup, checks that schema and row counts are preserved, and starts the new app
with ingress closed. Run `publish` only after staging succeeds and checks pass;
then verify `https://edgegames.win/api/health` and the changed website behavior.
Retain the previous image and backup for recovery. Do not use the retired PC
launcher to deploy the hosted site.

Complete encrypted group backups run every six hours to private array storage
`/mnt/disk1/website-backups`. The hourly PC copy requires the PC on and Matt signed
in. The recovery identity stays off-server. Local health reports live under
`/mnt/cache/appdata/websites/control/status/health.json`. General restore creates
fresh isolated destinations and does not replace active production data.

## Cutover, rollback and development

Stop the PC connector and writers, disable their restart/automation, take a final
paired snapshot and verify its fresh Tower restore before opening Tower ingress.
Exactly one public origin may accept writes. Existing-account/public checks,
PC independence and the 48-hour soak remain pending.

The migration creates ignored `runtime/pc-origin-disabled.json` before freezing the
PC source. `deploy/Start-Docker.ps1` refuses every mode while it exists, because the
old modes share production data. Keep this marker after cutover. Direct Docker
commands remain administrator operations and must follow the same recovery rules.

After Tower accepts writes, returning to the PC requires a new authoritative
Tower backup restored into fresh PC recovery storage. Never resume stale PC data.
The isolated reverse-host drill preserved games/sessions and subsequent new PC
writes through container restart; it did not switch public authority.

Use separate development data, credentials and local-only origins. Do not run this
server template or a public connector as a development environment. Retired PC
startup paths must stay disabled after cutover. Retain original copies at least
14 days and until two verified recovery sets exist; later deletion needs an
explicit scope.

The local Unraid workspace holds the canonical runbook at
`docs/WEBSITE_MIGRATION_PLAN_2026-09-09.md` and evidence at
`docs/website-migration-2026-09-09/EXECUTION.md`. Record the actual accepted release
and verification date here only after cutover succeeds.

Full Tower reboot evidence: all nine website containers and 15 ordinary service
containers returned automatically with preserved configuration, storage and sessions.
Two actual production backup generations for this group have been independently
restored and tested. Originals remain retained; this does not waive final acceptance.
