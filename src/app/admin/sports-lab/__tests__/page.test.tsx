import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  getAdmin: vi.fn(),
  cookies: vi.fn(),
  home: vi.fn(),
  games: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
vi.mock("@/server/admin", () => ({ ADMIN_COOKIE: "edge-admin", getAdmin: mocks.getAdmin }));
vi.mock("@/components/SportsLabLaunch", () => import("../../../../components/SportsLabLaunch"));
vi.mock("@/server/adminMail", () => ({ mailConfigured: () => false }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteContent: { findUnique: mocks.home },
    catalogGame: { findMany: mocks.games },
  },
}));
vi.mock("@/components/AdminForms", () => ({
  AdminForm: () => null, CredentialsForm: () => null, Field: () => null,
}));
import SportsLabPage from "../page";
import AdminPage from "../../page";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.cookies.mockResolvedValue(new Map());
  mocks.getAdmin.mockResolvedValue(null);
  mocks.home.mockResolvedValue(null);
  mocks.games.mockResolvedValue([]);
});

describe("Sports Lab administrator access", () => {
  for (const [label, page] of [["administration navigation", AdminPage], ["direct Sports Lab route", SportsLabPage]] as const) {
    for (const cookie of [undefined, "authjs.session-token", "edge-member"]) {
      it(`rejects ${cookie || "anonymous"} access to ${label}`, async () => {
        mocks.cookies.mockResolvedValue(new Map(cookie ? [[cookie, { value: "other-session" }]] : []));
        await expect(page()).rejects.toThrow("redirect:/admin/login");
        expect(mocks.getAdmin).toHaveBeenCalledWith(undefined);
        expect(mocks.home).not.toHaveBeenCalled();
      });
    }
    it(`requires completed setup for ${label}`, async () => {
      mocks.cookies.mockResolvedValue(new Map([["edge-admin", { value: "admin-session" }]]));
      mocks.getAdmin.mockResolvedValue({ needsSetup: true });
      await expect(page()).rejects.toThrow("redirect:/admin/setup");
    });
  }

  it("shows administrators the Sports Lab navigation entry", async () => {
    mocks.getAdmin.mockResolvedValue({ needsSetup: false, username: "owner" });
    const html = renderToStaticMarkup(await AdminPage());
    expect(html).toContain('href="/admin/sports-lab"');
    expect(html).toContain("Open Sports Lab");
  });

  it("offers secure remote launch only when configured", async () => {
    vi.stubEnv("SPORTS_LAB_ORIGIN", "https://lab.app.example.test");
    mocks.getAdmin.mockResolvedValue({ needsSetup: false });
    const html = renderToStaticMarkup(await SportsLabPage());
    expect(html).toContain("Open Sports Lab securely");
    expect(html).not.toContain("Remote access is not configured");
  });

  it("offers only an explicitly local launch without forwarding credentials", async () => {
    mocks.cookies.mockResolvedValue(new Map([["edge-admin", { value: "admin-session" }]]));
    mocks.getAdmin.mockResolvedValue({ needsSetup: false });
    const html = renderToStaticMarkup(await SportsLabPage());
    expect(mocks.getAdmin).toHaveBeenCalledWith("admin-session");
    expect(html).toContain('href="http://127.0.0.1:8501/"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain("phone or another computer");
    expect(html).toContain("Remote access is not configured");
    expect(html).not.toContain("admin-session");
    expect(html).not.toContain("iframe");
  });
});
