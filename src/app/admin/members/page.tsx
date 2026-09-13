import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE, getAdmin } from "@/server/admin";
import { Field } from "@/components/AdminForms";
import { MemberForm } from "@/components/MemberForm";
const day = (value: Date) => value.toISOString().slice(0, 10);
const pageNumber = (value?: string) =>
  Math.min(100000, Math.max(1, Math.floor(Number(value)) || 1));
export default async function ManageMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; invites?: string; q?: string }>;
}) {
  const admin = await getAdmin((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!admin) redirect("/admin/login");
  if (admin.needsSetup) redirect("/admin/setup");
  const params = await searchParams;
  const page = pageNumber(params.page),
    invitePage = pageNumber(params.invites),
    query = (params.q || "").trim().slice(0, 80);
  const where = query
    ? {
        OR: [
          { email: { contains: query } },
          { displayName: { contains: query } },
        ],
      }
    : {};
  const [members, count, invites, inviteCount] = await Promise.all([
    prisma.memberAccount.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * 25,
      take: 25,
      select: {
        id: true,
        email: true,
        displayName: true,
        active: true,
        createdAt: true,
      },
    }),
    prisma.memberAccount.count({ where }),
    prisma.memberInvite.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (invitePage - 1) * 25,
      take: 25,
      select: {
        id: true,
        label: true,
        email: true,
        purpose: true,
        expiresAt: true,
        claimedAt: true,
        revokedAt: true,
      },
    }),
    prisma.memberInvite.count(),
  ]);
  const href = (p: number, i: number) =>
    `/admin/members?page=${p}&invites=${i}&q=${encodeURIComponent(query)}`;
  return (
    <>
      <Link href="/admin">← Administration</Link>
      <div className="admin-heading">
        <div>
          <p className="collection-kicker">PRIVATE ACCESS</p>
          <h1>Members &amp; invitations</h1>
          <p>Choose who can enter your private collection.</p>
        </div>
        <Link className="btn-outline" href="/members/login">
          View member entrance
        </Link>
      </div>
      <section className="admin-panel">
        <h2>Invite someone</h2>
        <p>
          Generate a code, copy the message, and send it yourself. Each code can
          create one account. No email service is required.
        </p>
        <MemberForm
          management
          action="invite"
          submitLabel="Generate invitation code"
        >
          <Field label="Invitation label" name="label" maxLength={80} />
          <Field
            label="Restrict to email (optional)"
            name="email"
            type="email"
            required={false}
            maxLength={254}
          />
          <label className="admin-field">
            Code expires in
            <select name="days" defaultValue="7">
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
        </MemberForm>
        <p className="admin-help">
          Without an email restriction, anyone holding the code can redeem it.
          An email restriction does not verify ownership of that inbox; share
          the code privately with the intended person.
        </p>
      </section>
      <section className="admin-panel">
        <h2>Member accounts</h2>
        <form className="member-search" method="get">
          <label className="admin-field">
            Find a member
            <input
              name="q"
              defaultValue={query}
              maxLength={80}
              placeholder="Name or email"
            />
          </label>
          <button className="btn-outline" type="submit">
            Search
          </button>
        </form>
        <p>
          {count} matching {count === 1 ? "member" : "members"}
        </p>
        {!members.length && <p>No member accounts to show.</p>}
        <div className="admin-game-list">
          {members.map((member) => (
            <details className="admin-game" key={member.id}>
              <summary>
                {member.displayName}
                <span>{member.active ? "Active" : "Suspended"}</span>
              </summary>
              <p>
                {member.email} · Joined {day(member.createdAt)}
              </p>
              <MemberForm
                management
                action="updateMember"
                values={{ id: member.id }}
                submitLabel="Save member"
              >
                <Field
                  label="Member name"
                  name="displayName"
                  value={member.displayName}
                  maxLength={80}
                />
                <label className="admin-field">
                  Access
                  <select name="active" defaultValue={String(member.active)}>
                    <option value="true">Active</option>
                    <option value="false">Suspended</option>
                  </select>
                </label>
              </MemberForm>
              <p className="admin-help">
                Saving signs this member out on every device and cancels
                outstanding reset codes. Suspension blocks sign-in immediately.
              </p>
              <MemberForm
                management
                action="revokeSessions"
                values={{ id: member.id }}
                submitLabel="Sign out on all devices"
              />
              {member.active && (
                <MemberForm
                  management
                  action="resetMember"
                  values={{ id: member.id }}
                  submitLabel="Generate password-reset code"
                />
              )}
            </details>
          ))}
        </div>
        <nav className="member-pagination" aria-label="Member pages">
          {page > 1 && (
            <Link href={href(page - 1, invitePage)}>← Previous members</Link>
          )}
          {page * 25 < count && (
            <Link href={href(page + 1, invitePage)}>Next members →</Link>
          )}
        </nav>
      </section>
      <section className="admin-panel">
        <h2>Invitation history</h2>
        <p>
          Codes are stored securely and cannot be displayed again. Create a
          replacement if needed.
        </p>
        {!invites.length && <p>No invitations yet.</p>}
        <div className="admin-game-list">
          {invites.map((invite) => {
            const state = invite.claimedAt
              ? "Used"
              : invite.revokedAt
                ? "Revoked"
                : invite.expiresAt <= new Date()
                  ? "Expired"
                  : "Available";
            return (
              <details className="admin-game" key={invite.id}>
                <summary>
                  {invite.label}
                  <span>{state}</span>
                </summary>
                <p>
                  {invite.purpose === "reset"
                    ? "Password reset"
                    : "New membership"}{" "}
                  · {invite.email || "Any recipient"}
                  <br />
                  Expires{" "}
                  {invite.expiresAt
                    .toISOString()
                    .replace("T", " ")
                    .slice(0, 16)}{" "}
                  UTC
                </p>
                {state === "Available" && (
                  <MemberForm
                    management
                    action="revokeInvite"
                    values={{ id: invite.id }}
                    submitLabel="Revoke code"
                  />
                )}
              </details>
            );
          })}
        </div>
        <nav className="member-pagination" aria-label="Invitation pages">
          {invitePage > 1 && (
            <Link href={href(page, invitePage - 1)}>
              ← Previous invitations
            </Link>
          )}
          {invitePage * 25 < inviteCount && (
            <Link href={href(page, invitePage + 1)}>Next invitations →</Link>
          )}
        </nav>
      </section>
    </>
  );
}
