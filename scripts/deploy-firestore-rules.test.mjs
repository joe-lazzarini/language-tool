import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { publishFirestoreRules, serviceAccountAssertion } from "./deploy-firestore-rules.mjs";

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    publicKey,
    serviceAccount: {
      client_email: "firebase-adminsdk@project.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    },
  };
}

describe("serviceAccountAssertion", () => {
  it("signs a JWT the token endpoint can verify", () => {
    const { publicKey, serviceAccount } = keyPair();
    const jwt = serviceAccountAssertion(serviceAccount, 1_700_000_000);
    const [header, payload, signature] = jwt.split(".");
    const verified = createVerify("RSA-SHA256")
      .update(`${header}.${payload}`)
      .verify(publicKey, signature, "base64url");
    expect(verified).toBe(true);
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({
      iss: serviceAccount.client_email,
      iat: 1_700_000_000,
      aud: "https://oauth2.googleapis.com/token",
    });
  });
});

describe("publishFirestoreRules", () => {
  it("creates a ruleset and releases it to cloud.firestore", async () => {
    const { serviceAccount } = keyPair();
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url: String(url), body: options.body });
      if (String(url).includes("oauth2.googleapis.com")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "token" }) };
      }
      if (String(url).endsWith("/rulesets")) {
        return {
          status: 200,
          text: async () => JSON.stringify({ name: "projects/app/rulesets/abc" }),
        };
      }
      return { status: 200, text: async () => JSON.stringify({ name: "projects/app/releases/cloud.firestore" }) };
    };

    const result = await publishFirestoreRules({
      projectId: "app",
      serviceAccount,
      rules: "rules_version = '2';",
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, rulesetName: "projects/app/rulesets/abc" });
    const rulesetCall = calls.find((call) => String(call.url).endsWith("/rulesets"));
    expect(JSON.parse(rulesetCall.body).source.files[0]).toEqual({
      name: "firestore.rules",
      content: "rules_version = '2';",
    });
    const releaseCall = calls.find((call) => String(call.url).endsWith("/releases/cloud.firestore"));
    expect(JSON.parse(releaseCall.body).release.rulesetName).toBe("projects/app/rulesets/abc");
  });

  it("returns the permission hint when the rules API responds 403", async () => {
    const { serviceAccount } = keyPair();
    const fetchImpl = async (url) => {
      if (String(url).includes("oauth2.googleapis.com")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "token" }) };
      }
      return {
        status: 403,
        text: async () => JSON.stringify({ error: { message: "The caller does not have permission" } }),
      };
    };

    const result = await publishFirestoreRules({
      projectId: "app",
      serviceAccount,
      rules: "rules_version = '2';",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("HTTP 403: The caller does not have permission");
    expect(result.detail).toContain("Firebase Rules Admin");
    expect(result.detail).toContain(serviceAccount.client_email);
    expect(result.detail).toContain("not blocked");
  });
});
