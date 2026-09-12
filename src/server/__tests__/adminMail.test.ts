import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), create: vi.fn() }));
vi.mock("admin-mailer", () => ({ default: { createTransport: mocks.create } }));
import { mailConfigured, sendAdminEmail } from "../adminMail";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SMTP_HOST", "smtp.example.test");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_FROM", "games@example.test");
  vi.stubEnv("AUTH_URL", "https://games.example.test");
  mocks.create.mockReturnValue({ sendMail: mocks.send });
  mocks.send.mockResolvedValue({ accepted: ["owner@example.test"] });
});
afterEach(() => vi.unstubAllEnvs());
describe("admin mail delivery contract", () => {
  it("sends only to the chosen address using TLS and an origin-bound fragment link", async () => {
    await sendAdminEmail("owner@example.test", "owner", "test-token", "reset");
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requireTLS: true,
        secure: false,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.test",
        text: expect.stringContaining(
          "https://games.example.test/admin/reset#test-token",
        ),
      }),
    );
    expect(mocks.send.mock.calls[0][0].text).toContain("Admin username: owner");
  });
  it("uses implicit TLS for port 465", async () => {
    vi.stubEnv("SMTP_PORT", "465");
    await sendAdminEmail("owner@example.test", "owner", "token", "verify");
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true, requireTLS: false }),
    );
  });
  it("reports missing configuration and rejected delivery without logging secrets", async () => {
    vi.stubEnv("SMTP_HOST", "");
    expect(mailConfigured()).toBe(false);
    await expect(
      sendAdminEmail("owner@example.test", "owner", "token", "verify"),
    ).rejects.toThrow("not configured");
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    mocks.send.mockRejectedValue(new Error("secret-provider-error"));
    await expect(
      sendAdminEmail("owner@example.test", "owner", "token", "verify"),
    ).rejects.toThrow("could not accept");
  });
});
