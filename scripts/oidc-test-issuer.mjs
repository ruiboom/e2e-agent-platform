// Local OIDC test issuer (H6) — RS256 keypair, a JWKS endpoint, and a token
// minter. Stands in for a real IdP so OIDC verification can be tested end-to-end.
//   GET /.well-known/jwks.json
//   GET /token?sub=alice&role=admin[&exp=5m|expired][&iss=...][&aud=...]
import { createServer } from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const PORT = 9099;
const ISSUER = `http://localhost:${PORT}`;
const AUDIENCE = "agent-platform";
const KID = "test-key-1";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: KID, alg: "RS256", use: "sig" };

async function mint(sub, role, { exp = "5m", iss = ISSUER, aud = AUDIENCE } = {}) {
  const jwt = new SignJWT({ role, name: sub })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuedAt()
    .setIssuer(iss)
    .setAudience(aud)
    .setSubject(sub);
  if (exp === "expired") jwt.setExpirationTime(Math.floor(Date.now() / 1000) - 60);
  else jwt.setExpirationTime(exp);
  return jwt.sign(privateKey);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER);
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/.well-known/jwks.json") {
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }
  if (url.pathname === "/token") {
    const q = url.searchParams;
    const token = await mint(q.get("sub") || "alice", q.get("role") || "admin", {
      exp: q.get("exp") || "5m",
      iss: q.get("iss") || ISSUER,
      aud: q.get("aud") || AUDIENCE,
    });
    res.end(JSON.stringify({ token }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => console.log(`oidc test issuer on ${ISSUER}`));
