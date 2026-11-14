import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("firestore accuracy rules", () => {
  const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");

  it("isolates accuracy documents and caps their size", () => {
    expect(rules).toContain("match /users/{userId}/accuracy/{dirId}");
    expect(rules).toContain("isOwner(userId)");
    expect(rules).toContain("data.words.size() <= 1500");
    expect(rules).toContain("request.resource.size() < 200000");
    expect(rules).toContain("dirId[0:2] != dirId[3:5]");
  });
});
