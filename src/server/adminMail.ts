import nodemailer from "admin-mailer";
import { AdminError } from "./admin";

export function mailConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.AUTH_URL,
  );
}

export async function sendAdminEmail(
  to: string,
  username: string,
  token: string,
  purpose: "verify" | "reset",
) {
  if (!mailConfigured())
    throw new AdminError(
      "Email delivery is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_FROM and mail credentials on the server.",
      503,
    );
  const origin = new URL(process.env.AUTH_URL!);
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:")
    throw new AdminError("Email links require an HTTPS site address.", 503);
  const port = Number(process.env.SMTP_PORT || "587");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  // Fragments stay out of HTTP request logs and referrer headers.
  const url = new URL(`/admin/${purpose}`, origin.origin);
  url.hash = token;
  try {
    const result = await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject:
        purpose === "verify"
          ? "Verify your Edge Games recovery email"
          : "Reset your Edge Games admin password",
      text: `Admin username: ${username}\n\n${purpose === "verify" ? "Verify your recovery email" : "Reset your password"}:\n${url.toString()}\n\nThis single-use link expires in 30 minutes. If you did not request this, ignore this email.`,
    });
    if (!result.accepted?.length) throw new Error("No recipient accepted");
  } catch {
    throw new AdminError(
      "The mail server could not accept the email. Check its settings and try again.",
      503,
    );
  }
}
