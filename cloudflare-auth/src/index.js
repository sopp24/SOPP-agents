import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

const CHALLENGE_TTL_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_CREDENTIALS = 5;
const RATE_WINDOW_SECONDS = 10 * 60;
const RATE_LIMIT = 60;
const MAX_BODY_BYTES = 100_000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function corsHeaders(env, origin) {
  if (!origin || origin !== env.ALLOWED_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Enrollment-Code",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) mismatch |= (a[i] || 0) ^ (b[i] || 0);
  return mismatch === 0;
}

async function readBody(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  return JSON.parse(text || "{}");
}

async function countCredentials(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM credentials").first();
  return Number(row?.n || 0);
}

async function requireEnrollmentCode(request, env) {
  if (!env.ENROLLMENT_SECRET || env.ENROLLMENT_SECRET.length < 32) {
    return false;
  }
  return constantTimeEqual(request.headers.get("X-Enrollment-Code"), env.ENROLLMENT_SECRET);
}

async function rateLimit(request, env) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / RATE_WINDOW_SECONDS) * RATE_WINDOW_SECONDS;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = base64url(await hmac(env.SESSION_SECRET, ip));
  await env.DB.prepare(
    "INSERT INTO rate_limits (key, window_start, attempts) VALUES (?, ?, 1) " +
    "ON CONFLICT(key) DO UPDATE SET " +
    "attempts = CASE WHEN window_start = excluded.window_start THEN attempts + 1 ELSE 1 END, " +
    "window_start = excluded.window_start",
  ).bind(key, windowStart).run();
  const row = await env.DB.prepare("SELECT attempts FROM rate_limits WHERE key = ?").bind(key).first();
  await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(windowStart - 24 * 60 * 60).run();
  return Number(row?.attempts || 0) <= RATE_LIMIT;
}

async function saveChallenge(env, purpose, challenge) {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO challenges (id, challenge, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(id, challenge, purpose, now + CHALLENGE_TTL_SECONDS, now).run();
  await env.DB.prepare("DELETE FROM challenges WHERE expires_at < ?").bind(now).run();
  return id;
}

async function takeChallenge(env, id, purpose) {
  if (typeof id !== "string" || id.length > 80) return null;
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT id, challenge FROM challenges WHERE id = ? AND purpose = ? AND expires_at >= ?",
  ).bind(id, purpose, now).first();
  if (!row) return null;
  // A challenge is single-use, including when verification fails.
  await env.DB.prepare("DELETE FROM challenges WHERE id = ?").bind(id).run();
  return row.challenge;
}

async function createSession(env) {
  const payload = {
    sub: "sopp-agents-owner",
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    jti: crypto.randomUUID(),
  };
  const encoded = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = base64url(await hmac(env.SESSION_SECRET, encoded));
  return { token: encoded + "." + signature, expiresIn: SESSION_TTL_SECONDS };
}

async function verifySession(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9_.-]{20,2048})$/);
  if (!match || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return null;
  const [encoded, suppliedSignature] = match[1].split(".");
  if (!encoded || !suppliedSignature) return null;
  const expectedSignature = base64url(await hmac(env.SESSION_SECRET, encoded));
  if (!(await constantTimeEqual(suppliedSignature, expectedSignature))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(encoded)));
    if (payload.sub !== "sopp-agents-owner" || !Number.isInteger(payload.exp) || payload.exp <= Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

async function handle(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(env, origin);

  if (request.method === "OPTIONS") {
    if (!headers["Access-Control-Allow-Origin"]) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers });
  }

  const isHealthCheck = url.pathname === "/health" && request.method === "GET";
  if (origin !== env.ALLOWED_ORIGIN && !(isHealthCheck && !origin)) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  if (!env.DB || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return json({ error: "SERVER_NOT_CONFIGURED" }, 503, headers);
  }

  if (url.pathname === "/health" && request.method === "GET") {
    return json({ status: "ok", service: "sopp-agents-auth" }, 200, headers);
  }

  // La simple vérification d'un jeton (/session) n'est pas limitée : les applications
  // l'appellent à chaque ouverture. Les routes d'inscription et d'authentification le sont.
  const isSessionCheck = url.pathname === "/session" && request.method === "GET";
  if (!isSessionCheck && !(await rateLimit(request, env))) return json({ error: "RATE_LIMITED" }, 429, headers);

  if (url.pathname === "/register/options" && request.method === "POST") {
    if (!(await requireEnrollmentCode(request, env))) return json({ error: "INVALID_ENROLLMENT_CODE" }, 401, headers);
    if ((await countCredentials(env)) >= MAX_CREDENTIALS) return json({ error: "TOO_MANY_DEVICES" }, 409, headers);

    const existing = await env.DB.prepare("SELECT id, transports FROM credentials").all();
    // Identifiant utilisateur aléatoire par appareil : deux passkeys du même site
    // (Face ID sur iPhone, Touch ID sur Mac) ne s'écrasent plus via le trousseau iCloud.
    const userID = crypto.getRandomValues(new Uint8Array(16));
    const options = await generateRegistrationOptions({
      rpName: env.RP_NAME || "SOPP Agents",
      rpID: env.RP_ID || "sopp24.github.io",
      userID,
      userName: "sopp-agents-owner",
      userDisplayName: "SOPP Agents",
      attestationType: "none",
      excludeCredentials: existing.results.map((row) => ({
        id: row.id,
        transports: JSON.parse(row.transports || "[]"),
      })),
      supportedAlgorithmIDs: [-7, -257],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      timeout: 60_000,
    });
    const challengeId = await saveChallenge(env, "registration", options.challenge);
    return json({ challengeId, options }, 200, headers);
  }

  if (url.pathname === "/register/verify" && request.method === "POST") {
    if (!(await requireEnrollmentCode(request, env))) return json({ error: "INVALID_ENROLLMENT_CODE" }, 401, headers);
    if ((await countCredentials(env)) >= MAX_CREDENTIALS) return json({ error: "TOO_MANY_DEVICES" }, 409, headers);
    const body = await readBody(request);
    const expectedChallenge = await takeChallenge(env, body.challengeId, "registration");
    if (!expectedChallenge) return json({ error: "CHALLENGE_EXPIRED" }, 400, headers);

    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: env.ALLOWED_ORIGIN,
      expectedRPID: env.RP_ID || "sopp24.github.io",
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo.userVerified) {
      return json({ error: "REGISTRATION_NOT_VERIFIED" }, 400, headers);
    }

    const credential = verification.registrationInfo.credential;
    await env.DB.prepare(
      "INSERT INTO credentials (id, public_key, counter, transports, device_type, backed_up, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      credential.id,
      base64url(credential.publicKey),
      credential.counter,
      JSON.stringify(credential.transports || []),
      verification.registrationInfo.credentialDeviceType || "singleDevice",
      verification.registrationInfo.credentialBackedUp ? 1 : 0,
      Math.floor(Date.now() / 1000),
    ).run();

    return json({ verified: true }, 200, headers);
  }

  if (url.pathname === "/auth/options" && request.method === "POST") {
    const rows = await env.DB.prepare("SELECT id, transports FROM credentials").all();
    if (!rows.results.length) return json({ error: "NOT_ENROLLED" }, 409, headers);
    const options = await generateAuthenticationOptions({
      rpID: env.RP_ID || "sopp24.github.io",
      allowCredentials: rows.results.map((row) => ({
        id: row.id,
        transports: JSON.parse(row.transports || "[]"),
      })),
      userVerification: "required",
      timeout: 60_000,
    });
    const challengeId = await saveChallenge(env, "authentication", options.challenge);
    return json({ challengeId, options }, 200, headers);
  }

  if (url.pathname === "/auth/verify" && request.method === "POST") {
    const body = await readBody(request);
    const expectedChallenge = await takeChallenge(env, body.challengeId, "authentication");
    if (!expectedChallenge) return json({ error: "CHALLENGE_EXPIRED" }, 400, headers);
    if (!body.response || typeof body.response.id !== "string") return json({ error: "INVALID_RESPONSE" }, 400, headers);

    const row = await env.DB.prepare(
      "SELECT id, public_key, counter, transports, device_type, backed_up FROM credentials WHERE id = ?",
    ).bind(body.response.id).first();
    if (!row) return json({ error: "UNKNOWN_CREDENTIAL" }, 401, headers);

    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: env.ALLOWED_ORIGIN,
      expectedRPID: env.RP_ID || "sopp24.github.io",
      credential: {
        id: row.id,
        publicKey: fromBase64url(row.public_key),
        counter: Number(row.counter),
        transports: JSON.parse(row.transports || "[]"),
      },
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.authenticationInfo.userVerified) {
      return json({ error: "AUTHENTICATION_NOT_VERIFIED" }, 401, headers);
    }

    await env.DB.prepare("UPDATE credentials SET counter = ?, backed_up = ? WHERE id = ?")
      .bind(
        verification.authenticationInfo.newCounter,
        verification.authenticationInfo.credentialBackedUp ? 1 : 0,
        row.id,
      ).run();

    return json(await createSession(env), 200, headers);
  }

  if (url.pathname === "/session" && request.method === "GET") {
    const session = await verifySession(request, env);
    if (!session) return json({ authenticated: false }, 401, headers);
    return json({ authenticated: true, expiresAt: session.exp }, 200, headers);
  }

  return json({ error: "NOT_FOUND" }, 404, headers);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      // Never expose internal exception details to the browser.
      console.error("SOPP Agents auth error:", error?.message || "unknown");
      const origin = request.headers.get("Origin");
      return json({ error: "INTERNAL_ERROR" }, 500, corsHeaders(env, origin));
    }
  },
};
