import http from "node:http";
import https from "node:https";
import { createHash, randomBytes, X509Certificate } from "node:crypto";
import { once } from "node:events";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { sportsLabTestCertificates } from "./lib/sports-lab-test-certificates";
import { createSportsLabBridge } from "../src/server/sportsLabBridge";
import { createSportsLabGateway, LAB_LAUNCH_PATH } from "../src/server/sportsLabGateway";
import assert from "node:assert/strict";

// Explicit test dependencies; this script never starts the real Lab launcher.
async function main() {
const python = process.env.LAB_FIXTURE_PYTHON;
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
const output = process.env.LAB_QA_OUTPUT;
if (!python || !playwrightModule || !output) throw new Error("Set LAB_FIXTURE_PYTHON, PLAYWRIGHT_MODULE and LAB_QA_OUTPUT for isolated QA.");
mkdirSync(output, { recursive: true });
const { chromium } = createRequire(path.resolve("package.json"))(playwrightModule);
const certs = sportsLabTestCertificates();
const reservation = http.createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
const labPort = (reservation.address() as AddressInfo).port;
await new Promise<void>(resolve => reservation.close(() => resolve()));
const labOrigin = new URL(`http://127.0.0.1:${labPort}`);
const child = spawn(python, ["-m", "streamlit", "run", path.resolve("scripts/fixtures/sports-lab-streamlit.py"), "--server.address", "127.0.0.1", "--server.port", String(labPort), "--server.enableCORS", "true", "--server.enableXsrfProtection", "true", "--server.headless", "true", "--browser.gatherUsageStats", "false"], { cwd: certs.directory, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
const logs: string[] = []; child.stdout.on("data", value => logs.push(value.toString())); child.stderr.on("data", value => logs.push(value.toString()));
const bridgeOrigin = new URL("http://127.0.0.1:1");
const bridge = createSportsLabBridge({ trustedAddress: "127.0.0.1", bridgeOrigin, labOrigin });
bridge.server.listen(0, "127.0.0.1"); await once(bridge.server, "listening"); bridgeOrigin.port = String((bridge.server.address() as AddressInfo).port);
const front = https.createServer(certs.server, (req, res) => {
  if (gateway.handles(req)) gateway.handle(req, res);
  else { res.writeHead(404); res.end("Synthetic admin fixture"); }
});
front.on("upgrade", (req, socket, head) => gateway.upgrade(req, socket, head));
front.listen(0, "127.0.0.1"); await once(front, "listening");
const port = (front.address() as AddressInfo).port;
const adminOrigin = new URL(`https://localhost:${port}`), labSite = new URL(`https://127.0.0.1:${port}`);
const adminToken = randomBytes(32).toString("hex"), tokenHash = createHash("sha256").update(adminToken).digest("hex");
let authorized = true;
const gateway = createSportsLabGateway({ adminOrigin, labOrigin: labSite, bridgeOrigin }, async hash => authorized && hash === tokenHash ? { expiresAt: Date.now() + 60000 } : null, "__Host-edge-admin", { recheckMs: 100 });
const pin = createHash("sha256").update(new X509Certificate(certs.server.cert).publicKey.export({ format: "der", type: "spki" })).digest("base64");
const browser = await chromium.launch({ channel: "msedge", headless: true, args: [`--ignore-certificate-errors-spki-list=${pin}`] });
try {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${labOrigin.origin}/_stcore/health`)).ok) break; } catch {}
    if (child.exitCode !== null || i === 119) throw new Error("Synthetic Streamlit fixture failed to start.");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const context = await browser.newContext(); const page = await context.newPage();
  const response = await page.goto(labSite.origin); assert.equal(response.status(), 401);
  // Native client requests a launch using a synthetic existing admin session.
  const launch = await new Promise<string>((resolve, reject) => {
    const req = https.request({ hostname: "localhost", port, path: LAB_LAUNCH_PATH, method: "POST", ca: certs.ca, headers: { origin: adminOrigin.origin, cookie: `__Host-edge-admin=${adminToken}`, "content-type": "application/json" } }, res => { let body = ""; res.on("data", chunk => body += chunk); res.on("end", () => { try { assert.equal(res.statusCode, 200); resolve(JSON.parse(body).redirect); } catch (error) { reject(error); } }); });
    req.on("error", reject); req.end("{}");
  });
  await page.goto(launch);
  await page.getByRole("heading", { name: "Synthetic Sports Lab", exact: true }).waitFor({ timeout: 30000 });
  assert.equal(new URL(page.url()).hash, "");
  await page.getByRole("textbox", { name: "Test message" }).fill("gateway verified");
  await page.getByRole("textbox", { name: "Test message" }).press("Enter");
  await page.getByText("Received: gateway verified", { exact: true }).waitFor();
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, `remote-synthetic-${width}.png`), fullPage: true });
  }
  const cookies = await context.cookies(labSite.origin);
  assert(cookies.some((v: { name: string; secure: boolean; httpOnly: boolean }) => v.name === "__Host-edge-sports-lab" && v.secure && v.httpOnly));
  assert(cookies.some((v: { name: string }) => v.name === "_streamlit_xsrf"));
  authorized = false; gateway.recheck();
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(await page.evaluate(async () => (await fetch("/_stcore/health")).status), 401);
  console.log("PASS installed Edge: single-use bootstrap, TLS relay cookie, real Streamlit HTTP/assets/WebSocket/XSRF, interactive synthetic update, desktop/mobile and revocation.");
  console.log("All listeners were loopback fixtures. The frozen Lab was never contacted.");
} catch (error) { console.error(logs.join("")); throw error; }
finally {
  await browser.close(); gateway.close(); bridge.close(); front.closeAllConnections(); await new Promise<void>(r => front.close(() => r()));
  if (child.exitCode === null) {
    const exited = once(child, "exit");
    if (process.platform === "win32" && child.pid) execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "pipe" });
    else child.kill();
    await exited;
  }
  certs.cleanup();
}
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
