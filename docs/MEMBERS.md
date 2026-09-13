# Invite-only members

The member entrance is `/members`. Visitors are directed to `/members/login`;
only active member sessions can read the collection, account, and sports pages.
Public game accounts and the site owner have separate credentials and cookies.
Neither role automatically confers membership. The public catalog contains only
a Members entrance link, with no private tool listings or member data.

## Owner workflow

1. Sign in to `/admin` and open **Manage members & invitations**.
2. Enter a label, optionally restrict the invitation to one email, and choose
   a 1-, 7-, or 30-day expiry.
3. Generate the code and copy its message. Share it privately yourself. The
   plaintext code is displayed once; only its SHA-256 hash is stored.
4. The recipient opens `/members/join`, enters the code, and creates their
   account using a name, email, and password. Each code creates one account.
5. Search accounts by name or email. Rename, suspend, restore, or sign a member
   out on every device. Saving a member also invalidates their reset codes.
6. For password recovery, verify the person's identity yourself and generate a
   one-hour reset code for their active account. Share it privately. Generating
   another reset code revokes the previous one. Resetting a password signs the
   member out everywhere. Members can change their own password in My account.

Invitation and reset delivery do not require SMTP. This workflow does not send
messages automatically. Optional recipient email binding is not proof of inbox
ownership; possession of the privately delivered invitation is the enrollment
credential. Codes cannot be retrieved later; revoke and replace lost invitations.
Suspension retains account history and prevents login; it is reversible.

## Access boundary

`src/server/members.ts` validates membership against the database for each request.
Every private page checks access independently, and the shared private layout
adds a second guard. `/api/members` returns only the authenticated member's id,
name, and email. Owner management writes recheck the owner's current session,
version, expiration, and completed setup inside the write transaction.

Invitations use 192-bit random codes. Conditional code consumption and account
creation share one SQLite transaction. Failed signup leaves the code usable;
concurrent redemption cannot create two accounts. Bcrypt passwords use the same
12-character minimum and 72-byte maximum as owner passwords. Sessions use
256-bit random tokens, stored hashed, and expire after eight hours. Production
uses a Secure, HttpOnly, SameSite Strict, `__Host-` cookie. Suspension, forced
logout, and password changes revoke sessions. Private responses are no-store and
noindex. The service worker never caches private HTML or APIs.

Same-origin JSON requests, streamed body-size limits, global workload caps and
per-account login/enrollment/reset caps apply. Process-local throttles are a
backstop; the existing single-replica deployment should keep edge rate limits
on member authentication endpoints. No IP address is trusted from arbitrary
forwarded headers.

## Database upgrade

`20260912000000_members` adds only `MemberAccount`, `MemberSession`, and
`MemberInvite`. It does not change existing tables, enroll public players,
create an owner, or issue any codes. `pre-members.schema.prisma` captures the
deployed predecessor. The guarded migration runner accepts and verifies that
history before upgrading. The migration suite checks preservation of owner
credentials and public players, schema equivalence, foreign keys, and reruns.

Before Tower deployment, follow the existing separate additive-schema workflow:
rehearse on a current snapshot, confirm old-app compatibility, stop writers via
the controller, take and protect an encrypted backup plus a frozen copy, migrate
and compare every original row/table, then use the controller's app deploy and
publish flow. Do not reuse the admin-specific audit tool unchanged: its expected
new tables and migration are for the earlier release. No live database changes
are implied by local implementation or tests.

## Sports tool

The private `/members/sports` page is explicitly marked **Coming soon**. It does
not expose the local computer, perform predictions, or fabricate results. See
`SPORTS_MEMBER_INTEGRATION.md` for the inspected integration plan.

## Validation on 2026-09-12

- Node.js 22.23.2: all 296 tests pass, including 11 membership lifecycle and API
  tests against disposable SQLite databases. Membership tests also passed after
  the final login-password validation change.
- Type checking, lint, production build, guarded migration verification, and
  whitespace checks pass. Migration checks include the seven-migration deployed
  predecessor and preservation of owner credentials and public players.
- Production-mode browser QA passes at 1280×900 and 390×844: admin invitation
  generation, enrollment, login, suspension/restoration, reset, password change,
  private-page redirects, role separation, no-store responses, secure cookies,
  and phone layout. No page errors or horizontal overflow were observed.
- The preview uses a disposable local database. Membership has not been deployed
  to Tower, and the sports integration remains planned rather than connected.
