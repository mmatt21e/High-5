import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { CatalogGame } from "@prisma/client";
import { AdminForm, CredentialsForm, Field } from "@/components/AdminForms";
import { ADMIN_COOKIE, getAdmin } from "@/server/admin";
import { mailConfigured } from "@/server/adminMail";
import { prisma } from "@/lib/prisma";
function GameFields({ game }: { game?: CatalogGame }) {
  return (
    <>
      <Field
        label="Game title"
        name="title"
        value={game?.title}
        maxLength={80}
      />
      <label className="admin-field">
        Description
        <textarea
          name="description"
          defaultValue={game?.description}
          maxLength={400}
          required
          rows={3}
        />
      </label>
      <Field
        label="Category / player count"
        name="category"
        value={game?.category || "Card game"}
        maxLength={40}
      />
      <Field
        label="Play link (local path or HTTPS URL)"
        name="href"
        value={game?.href}
        required={false}
        maxLength={300}
      />
      <div className="admin-columns">
        <label className="admin-field">
          Visibility
          <select name="status" defaultValue={game?.status || "draft"}>
            <option value="draft">Draft — admin only</option>
            <option value="coming-soon">Coming soon</option>
            <option value="live">Live — ready to play</option>
          </select>
        </label>
        <label className="admin-field">
          Display order
          <input
            name="sortOrder"
            type="number"
            min={0}
            max={999}
            defaultValue={game?.sortOrder || 0}
            required
          />
        </label>
      </div>
    </>
  );
}
export default async function AdminPage() {
  const admin = await getAdmin((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!admin) redirect("/admin/login");
  if (admin.needsSetup) redirect("/admin/setup");
  const [home, games] = await Promise.all([
    prisma.siteContent.findUnique({ where: { id: "home" } }),
    prisma.catalogGame.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);
  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="collection-kicker">SIGNED IN AS {admin.username}</p>
          <h1>Your game collection</h1>
          <p>
            {games.filter((g) => g.status === "live").length} live ·{" "}
            {games.filter((g) => g.status === "coming-soon").length} coming soon
            · {games.filter((g) => g.status === "draft").length} drafts
          </p>
        </div>
        <div>
          <Link href="/" className="btn-outline">
            View website
          </Link>
          <AdminForm action="logout" submitLabel="Sign out" />
        </div>
      </div>
      <section className="admin-panel">
        <h2>Recovery email</h2>
        <p>
          {admin.recoveryEmail} ·{" "}
          <strong>{admin.emailVerified ? "Verified" : "Not verified"}</strong>
        </p>
        <p className="admin-help">
          {mailConfigured()
            ? "Mail delivery is configured. Verify your address to enable password recovery."
            : "Mail delivery is not configured. Add the SMTP settings on the server before verifying your address or using recovery."}
        </p>
        {!admin.emailVerified && (
          <AdminForm
            action="sendVerification"
            submitLabel="Send verification email"
          />
        )}
      </section>
      <section className="admin-panel">
        <h2>Home page</h2>
        <AdminForm action="saveHome">
          <Field
            label="Headline"
            name="headline"
            value={home?.headline}
            maxLength={120}
          />
          <label className="admin-field">
            Introduction
            <textarea
              name="intro"
              rows={3}
              defaultValue={home?.intro}
              maxLength={500}
              required
            />
          </label>
        </AdminForm>
      </section>
      <section className="admin-panel">
        <h2>Games</h2>
        <p>
          Live listings link to playable games. Coming-soon listings have no
          play button. Drafts are visible here only. Lower display numbers
          appear first.
        </p>
        <div className="admin-game-list">
          {games.map((game) => (
            <details key={game.id} className="admin-game">
              <summary>
                {game.title}
                <span>{game.status}</span>
              </summary>
              <AdminForm action="saveGame" values={{ id: game.id }}>
                <GameFields game={game} />
              </AdminForm>
              <AdminForm
                action="deleteGame"
                values={{ id: game.id }}
                submitLabel="Remove listing"
              />
            </details>
          ))}
        </div>
        <details className="admin-game">
          <summary>Add a game</summary>
          <AdminForm action="saveGame" submitLabel="Add listing">
            <GameFields />
          </AdminForm>
        </details>
      </section>
      <section className="admin-panel">
        <details>
          <summary>Account settings</summary>
          <h2>Username, password &amp; recovery email</h2>
          <CredentialsForm
            username={admin.username}
            email={admin.recoveryEmail || ""}
          />
        </details>
      </section>
    </>
  );
}
