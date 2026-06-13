import { describe, expect, it } from "vitest";
import { openApiDocument } from "@wenvy/contracts";

describe("HTTP contracts regression", () => {
  it("documents every MVP Worker route with stable operation ids", () => {
    expect(Object.keys(openApiDocument.paths).sort()).toEqual([
      "/health",
      "/openapi.json",
      "/v1/auth/magic-link/consume",
      "/v1/blobs/{commitId}",
      "/v1/envelopes/validate",
      "/v1/repos/{repoId}/branches/{branch}/push/intent",
      "/v1/rotations",
      "/v1/service-accounts/authorize",
      "/webhooks/github"
    ]);

    expect(
      Object.values(openApiDocument.paths).flatMap((pathItem) =>
        Object.values(pathItem).map((operation) => operation.operationId)
      )
    ).toContain("authorizeServiceAccount");
  });

  it("keeps every schema reference resolvable inside the document", () => {
    const serialized = JSON.stringify(openApiDocument);
    const refs = Array.from(serialized.matchAll(/"#\/components\/schemas\/([^"]+)"/gu)).map(
      (match) => match[1]
    );

    for (const ref of refs) {
      expect(openApiDocument.components.schemas).toHaveProperty(ref!);
    }
  });

  it("defines reusable error responses for mutating routes", () => {
    const mutatingOperations = Object.values(openApiDocument.paths).flatMap((pathItem) =>
      Object.entries(pathItem)
        .filter(([method]) => method !== "get")
        .map(([, operation]) => operation)
    );

    for (const operation of mutatingOperations) {
      expect(operation.responses).toHaveProperty("400");
      expect(operation.responses).toHaveProperty("500");
    }
  });
});
