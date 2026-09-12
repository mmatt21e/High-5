# Edge Games landing page and administration

The public home page is a game collection for both visitors and signed-in players.
Five-O's detailed introduction is at `/games/five-o`; its authenticated game
lobby remains `/lobby`. Existing accounts, games, invitations, and results remain
unchanged. The catalog is a directory: adding a listing does not implement or
deploy a new game. Local paths and external HTTPS game destinations are supported.

## Install / upgrade

Use Node.js 22 and `npm ci`. Back up the database, stop the app, then run
`npm run db:migrate` and `npm run build` before restarting. The additive migration
`20260911000000_site_admin` adds the catalog, home-page content, and separate
admin account/session/token tables. It seeds the Five-O listing and home copy,
but creates no administrator until the initial credentials and setup key pass.
The migration verifier covers the prior lobby release and older supported histories.

## First sign-in

1. On production, configure `ADMIN_SETUP_KEY` with a private random value of at
   least 32 characters. Generate one with
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   Save it privately in the deployment environment, never source control.
2. Open `/admin/login`. Use username **admin** and password **admin**. Expand
   **First-time setup** and enter the private key. Production rejects default
   login while no sufficiently long key is configured. Local development does
   not require a key unless one is configured.
3. Replace **both** credentials and enter your recovery email. Username rules:
   3–40 letters, numbers, dots, hyphens, or underscores; `admin` is reserved.
   Passwords require at least 12 characters and at most 72 UTF-8 bytes.
4. Sign in again with the new credentials. Remove `ADMIN_SETUP_KEY` from the
   production environment after completing setup; it cannot reset the account.
5. Select **Send verification email**, open the email, and confirm the address.
   Recovery is enabled only for the verified address.

The required setup gate applies to server-side writes and pages. Bootstrap
sessions expire in 15 minutes; configured admin sessions expire in eight hours.
Player accounts never confer administrative access. Username/password/email
changes require the current password, sign out all admin sessions, and invalidate
outstanding links. Changing the recovery email requires verification again.

## Mail delivery

Set `SMTP_HOST`, `SMTP_PORT` (normally 587 or 465), `SMTP_FROM`, and, when your
provider requires authentication, `SMTP_USER` and `SMTP_PASSWORD`. `AUTH_URL`
must be your canonical public HTTPS origin. Compose forwards these settings
from its environment file. The dashboard shows whether mail is configured;
it does not expose credentials or offer browser editing of server secrets.

Port 465 uses implicit TLS; other ports require STARTTLS. Invalid certificates
are rejected. No external AI service is involved. The mail library is installed
as `admin-mailer` to avoid activating the older optional Auth.js mail peer.
Admin mail uses plain text, with no remote attachments or user-supplied headers.

From `/admin/forgot`, enter your verified recovery email. The message includes
your username and a single-use reset link expiring after 30 minutes. Tokens are
stored only as SHA-256 hashes; link fragments keep them out of HTTP request logs.
The email page clears its fragment after loading. Reopen the email link if the
page is refreshed. Resetting a password revokes all sessions and links.

Recovery requests give a neutral response regardless of whether the address
matches or delivery is available. Delivery failures log a generic operational
message without addresses, secrets, or reset links. A successful send means the
SMTP server accepted the message; inbox delivery still depends on your provider.
No live email delivery is implied by passing automated tests.

## Editing the collection

The dashboard edits the home headline and introduction. Game listings have title,
description, category, destination, visibility, and display order. Draft listings
are private. Coming-soon listings are public with no play button. Live listings
require a local path or HTTPS URL. Removing a listing never deletes game data.
Published changes appear on the next page request. There is no HTML editor;
React escapes all entered text.

Request bodies are bounded, mutation requests require a same-origin JSON request,
and admin cookies are HttpOnly and SameSite Strict (Secure and `__Host-` prefixed
in production). Process-local throttling is a backstop: maintain edge limits
on `/api/admin` as with the existing single-replica game service. Recovery and
verification requests are limited to three per 15 minutes each, login to twelve.

Security references: [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
and [Nodemailer SMTP transport](https://nodemailer.com/smtp).

## Validation (2026-09-11)

- Clean dependency installation and npm audit: zero reported vulnerabilities.
- Node.js 22.23.2: 285 tests pass, lint and production build pass.
- Guarded migration verification passes for fresh databases, the prior lobby
  schema and all supported historical upgrade paths; invalid orphans fail closed.
- Production startup smoke test passes on a loopback listener.
- Desktop and 390px phone previews inspected. Browser checks cover the public
  collection, protected admin redirect, default login to mandatory setup, and
  dashboard/listing editor with a disposable fixture. That fixture was removed.
- No production deployment or real recovery-email delivery performed. SMTP
  configuration and owner email verification remain deployment setup steps.
