# Sports Lab administration access

Sign in through the existing site administrator login, choose Sports Lab, then
Open Sports Lab securely. Player and member accounts cannot launch it. Without
remote configuration, the page clearly labels its computer-local access option.

The public gateway uses HTTPS and a separate Lab subdomain. A same-origin admin
launch creates a short-lived, single-use code, redeemed for a host-only Secure,
HttpOnly relay cookie bound to the original administrator session. HTTP requests,
WebSocket upgrades/messages and idle connections recheck that session. Expiry,
sign-out, required setup or credential changes revoke access. Website credentials
are never forwarded to the Lab. Streamlit XSRF cookies/protocols are preserved.

The gateway connects to one fixed private IPv4 HTTP bridge on TCP 18501. The
bridge binds one private interface, accepts only the configured gateway's actual
TCP peer address, and forwards only to the existing loopback Lab on port 8501.
Forwarded headers cannot grant access. Paths, origins, request sizes, timeouts
and concurrency remain restricted; redirects and arbitrary targets are rejected.

## Private LAN trust boundary

The bridge hop is unencrypted. It relies on an explicitly accepted trusted-LAN
boundary, exact peer checks and a host firewall rule allowing only the gateway
IP, bridge program, destination IP/port and private network profile. Processes on
the trusted gateway host are inside that boundary. A compromised LAN path could
observe or alter traffic. This is not cryptographic client authentication.
Do not use this deployment mode on an untrusted LAN, expose the bridge publicly,
broaden the firewall rule, or bind it on every interface. Verify effective rules
and actual container egress before activation. A changed address fails closed.

## Configuration and release

Set both SPORTS_LAB_ORIGIN (for example https://lab.app.example.test) and
SPORTS_LAB_BRIDGE_URL (http://<BRIDGE_PRIVATE_IPV4>:18501). AUTH_URL must use HTTPS.
Both absent disables the gateway; partial, public, unexpected-port or legacy
certificate configuration is rejected. Copy the placeholder bridge JSON outside
Git and supply its private listenAddress and trustedAddress. The bridge's
--check option validates configuration/address ownership without listening.

The independent bridge does not start, stop, reconfigure or update the Lab.
Keep operational addresses, firewall/routing configuration and release evidence
in private local-only storage. The browser hostname must route to the admin
gateway, never directly to the bridge. Run private authorization checks before
publishing that route and preserve the existing release rollback procedure.

## Verification

Run lint, typecheck, tests and the production build, then the documented release
workflow. Security tests cover unauthorized roles, direct routes, origin/path
checks, fixed targets, peer spoofing, HTTP/WebSocket transport, expiry and logout.
scripts/verify-sports-lab-browser.ts runs real Streamlit interaction on synthetic
loopback fixtures using LAB_FIXTURE_PYTHON, PLAYWRIGHT_MODULE and LAB_QA_OUTPUT.
Its temporary HTTPS test certificates are unrelated to production identities;
it does not launch or operate the real Lab. Production access checks must avoid
model operations and protected outcomes.
