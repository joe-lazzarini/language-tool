import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const RULES_API = "https://firebaserules.googleapis.com/v1";
const SCOPES = "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

/** Signed JWT the OAuth token endpoint exchanges for an access token. */
export function serviceAccountAssertion(serviceAccount, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: SCOPES,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(serviceAccount.private_key, "base64url");
  return `${unsigned}.${signature}`;
}

function errorMessage(body, text) {
  if (body && typeof body === "object" && body.error) {
    const error = body.error;
    if (typeof error === "string") return error;
    if (typeof error.message === "string") return error.message;
  }
  return text || "Unknown error";
}

async function api(fetchImpl, token, url, options = {}) {
  const response = await fetchImpl(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  return { status: response.status, body, text };
}

export function permissionHint(projectId, email, detail) {
  return [
    `Firestore rules were not published (${detail}).`,
    "The site deploy is not blocked.",
    `Grant ${email} the role Firebase Rules Admin, then re-run Deploy GitHub Pages:`,
    `https://console.cloud.google.com/iam-admin/iam?project=${projectId}`,
  ].join(" ");
}

/**
 * Create a ruleset and point the cloud.firestore release at it.
 * This skips the Service Usage preflight that firebase-tools performs.
 */
export async function publishFirestoreRules({
  projectId,
  serviceAccount,
  rules,
  fetchImpl = fetch,
}) {
  const assertion = serviceAccountAssertion(serviceAccount);
  const tokenResponse = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const tokenText = await tokenResponse.text();
  let tokenBody = null;
  try {
    tokenBody = tokenText ? JSON.parse(tokenText) : null;
  } catch {
    tokenBody = null;
  }
  if (!tokenResponse.ok || !tokenBody?.access_token) {
    const detail = errorMessage(tokenBody, tokenText);
    return {
      ok: false,
      status: tokenResponse.status,
      detail: permissionHint(projectId, serviceAccount.client_email, `HTTP ${tokenResponse.status}: ${detail}`),
    };
  }

  const token = tokenBody.access_token;
  const created = await api(fetchImpl, token, `${RULES_API}/projects/${projectId}/rulesets`, {
    method: "POST",
    body: { source: { files: [{ name: "firestore.rules", content: rules }] } },
  });
  if (created.status !== 200 || !created.body?.name) {
    const detail = errorMessage(created.body, created.text);
    return {
      ok: false,
      status: created.status,
      detail: permissionHint(projectId, serviceAccount.client_email, `HTTP ${created.status}: ${detail}`),
    };
  }

  const releaseName = `projects/${projectId}/releases/cloud.firestore`;
  const patched = await api(fetchImpl, token, `${RULES_API}/${releaseName}`, {
    method: "PATCH",
    body: { release: { name: releaseName, rulesetName: created.body.name } },
  });
  if (patched.status === 200) {
    return { ok: true, rulesetName: created.body.name };
  }

  const posted = await api(fetchImpl, token, `${RULES_API}/projects/${projectId}/releases`, {
    method: "POST",
    body: { name: releaseName, rulesetName: created.body.name },
  });
  if (posted.status === 200) {
    return { ok: true, rulesetName: created.body.name };
  }

  const detail = errorMessage(posted.body, posted.text || errorMessage(patched.body, patched.text));
  return {
    ok: false,
    status: posted.status,
    detail: permissionHint(projectId, serviceAccount.client_email, `HTTP ${posted.status}: ${detail}`),
  };
}

async function main() {
  const projectId = (process.env.PROJECT_ID || "").trim();
  const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!projectId || !keyJson.trim()) {
    console.log(
      "Skipping Firestore rules. Set VITE_FIREBASE_PROJECT_ID and the FIREBASE_SERVICE_ACCOUNT secret on the github-pages environment to publish firestore.rules with the site.",
    );
    return;
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(keyJson);
  } catch {
    console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the downloaded private-key file unchanged.");
    process.exitCode = 1;
    return;
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    console.error("FIREBASE_SERVICE_ACCOUNT is missing client_email or private_key.");
    process.exitCode = 1;
    return;
  }

  const rulesPath = resolve(dirname(fileURLToPath(import.meta.url)), "../firestore.rules");
  const rules = readFileSync(rulesPath, "utf8");
  const result = await publishFirestoreRules({ projectId, serviceAccount, rules });
  if (!result.ok) {
    console.error(result.detail);
    console.log(`::warning::${result.detail.replace(/\s+/g, " ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Published Firestore rules ${result.rulesetName}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
