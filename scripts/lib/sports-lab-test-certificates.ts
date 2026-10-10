import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { X509Certificate } from "node:crypto";

/** One-day synthetic identities only; never installed or added to machine trust. */
export function sportsLabTestCertificates() {
  const prefix = path.join(realpathSync(tmpdir()), "edge-lab-test-");
  const directory = mkdtempSync(prefix);
  const openssl = process.env.OPENSSL_BIN || "openssl";
  const run = (args: string[]) => execFileSync(openssl, args, { cwd: directory, stdio: "pipe", windowsHide: true });
  run(["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-keyout", "ca.key", "-out", "ca.crt", "-days", "1", "-subj", "/CN=Edge-Lab-EPHEMERAL-TEST-CA", "-addext", "basicConstraints=critical,CA:TRUE"]);
  const identity = (name: string, server = false) => {
    run(["req", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", `/CN=${name}`]);
    writeFileSync(path.join(directory, `${name}.ext`), `basicConstraints=critical,CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=${server ? "serverAuth" : "clientAuth"}\n${server ? "subjectAltName=DNS:localhost,IP:127.0.0.1\n" : ""}`);
    run(["x509", "-req", "-in", `${name}.csr`, "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", `${name}.crt`, "-days", "1", "-extfile", `${name}.ext`]);
    const cert = readFileSync(path.join(directory, `${name}.crt`));
    return { cert, key: readFileSync(path.join(directory, `${name}.key`)), fingerprint: new X509Certificate(cert).fingerprint256 };
  };
  return {
    directory, ca: readFileSync(path.join(directory, "ca.crt")),
    server: identity("test-server", true), client: identity("edgegames-sports-proxy"), rogue: identity("wrong-client"),
    cleanup: () => {
      const resolved = realpathSync(directory);
      if (!resolved.startsWith(prefix)) throw new Error("Unexpected fixture cleanup path.");
      rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}
