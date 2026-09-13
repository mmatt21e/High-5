# Codex from Edge Games administration

Sign in at `/admin`, choose **Open Codex**, and enter the existing Tower Codex
dashboard access key. The standalone dashboard is served at `/admin/codex` over
the website's HTTPS connection. LAN access remains available separately.

The app environment variable `CODEX_DASHBOARD_URL` selects the private upstream
(Tower currently uses `http://192.168.1.50:8098`). Leave it empty to disable the
proxy. The URL must be an HTTP(S) origin without credentials or a path.

Every document, asset, and API request requires a valid administrator session
with setup completed. Member and player sessions do not authorize Codex access.
Codex retains its independent access-key login and CSRF checks. Only its session
cookie is forwarded upstream; its public cookie is Secure, HttpOnly, SameSite
Strict and limited to `/admin/codex`. Website credentials are never forwarded.
Mutations require the configured `AUTH_URL` origin and JSON. Responses are not
cached. Requests use a fixed upstream with restricted paths and no redirects.

The proxy rewrites the dashboard's root asset/API links, including exports and
its event stream. An open event stream rechecks the administrator session every
15 seconds. Signing out of Edge Games blocks subsequent requests; Lock dashboard
also ends the independent Codex session. Signing out does not stop running tasks.

The existing Tower dashboard controls models, approvals, conversations and
monitors. An authorized Codex user retains its existing host administration
capabilities. This integration does not alter those permissions or execute a task.

Validation includes unauthorized/incomplete setup, cross-origin mutation denial,
cookie isolation, payload limits, asset rewriting and stream session revocation.
Deployment verification is recorded in the Unraid workspace release report.
