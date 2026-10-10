import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { z } from "zod";
import { createSportsLabBridge } from "../src/server/sportsLabBridge";
import { privateLabAddress } from "../src/server/sportsLabConfig";

const schema = z.object({
  listenAddress: z.string().refine(privateLabAddress),
  listenPort: z.literal(18501),
  trustedAddress: z.string().refine(privateLabAddress),
}).strict().refine(config => config.listenAddress !== config.trustedAddress, "Bridge and trusted host must have different addresses.");
const at = process.argv.indexOf("--config");
if (at < 0 || !process.argv[at + 1]) throw new Error("Use --config <private JSON file> [--check].");
const config = schema.parse(JSON.parse(readFileSync(process.argv[at + 1], "utf8")));
if (!Object.values(networkInterfaces()).flat().some(address => address?.family === "IPv4" && address.address === config.listenAddress)) throw new Error("The configured bridge address is not assigned to this host; update the reviewed configuration.");
if (process.argv.includes("--check")) {
  console.log("Sports Lab bridge configuration validated; no listener started. Verify the exact host firewall restriction before activation.");
} else {
  const bridge = createSportsLabBridge({ trustedAddress: config.trustedAddress,
    bridgeOrigin: new URL(`http://${config.listenAddress}:${config.listenPort}`), labOrigin: new URL("http://127.0.0.1:8501") });
  bridge.server.listen(config.listenPort, config.listenAddress, () => console.log("Sports Lab restricted LAN bridge ready."));
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => bridge.close());
}
