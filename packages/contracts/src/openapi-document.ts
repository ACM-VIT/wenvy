export interface OpenApiDocument {
  readonly openapi: "3.1.0";
  readonly info: {
    readonly title: string;
    readonly version: string;
  };
  readonly paths: Record<string, Record<string, OpenApiOperation>>;
  readonly components: {
    readonly securitySchemes: Record<string, unknown>;
    readonly schemas: Record<string, unknown>;
  };
}

export interface OpenApiOperation {
  readonly operationId: string;
  readonly summary: string;
  readonly security?: readonly Record<string, readonly string[]>[];
  readonly requestBody?: unknown;
  readonly parameters?: readonly unknown[];
  readonly responses: Record<string, unknown>;
}

const jsonContent = (schemaRef: string) => ({
  content: {
    "application/json": {
      schema: { $ref: `#/components/schemas/${schemaRef}` }
    }
  }
});

const jsonResponse = (schemaRef: string) => ({
  description: "JSON response",
  ...jsonContent(schemaRef)
});

const errorResponses = {
  "400": jsonResponse("ErrorResponse"),
  "401": jsonResponse("ErrorResponse"),
  "403": jsonResponse("ErrorResponse"),
  "409": jsonResponse("ErrorResponse"),
  "500": jsonResponse("ErrorResponse")
} as const;

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Wenvy API",
    version: "0.1.0"
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer"
      },
      githubWebhookSignature: {
        type: "apiKey",
        in: "header",
        name: "X-Hub-Signature-256"
      }
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          message: { type: "string" }
        },
        additionalProperties: false
      },
      HealthResponse: {
        type: "object",
        required: ["ok", "service", "runtime"],
        properties: {
          ok: { type: "boolean" },
          service: { type: "string" },
          runtime: { type: "string" }
        },
        additionalProperties: false
      },
      ConsumeTokenResponse: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            enum: ["consumed", "expired", "already-used", "browser-mismatch", "ip-mismatch", "missing"]
          },
          consumedAt: { type: "string", format: "date-time" }
        },
        additionalProperties: false
      },
      PushIntentResponse: {
        type: "object",
        required: ["status", "headCommit"],
        properties: {
          status: { enum: ["accepted", "duplicate", "conflict", "idempotency-conflict"] },
          commit: { type: "string" },
          headCommit: { type: ["string", "null"] }
        },
        additionalProperties: true
      },
      PushCommitResponse: {
        type: "object",
        required: ["status", "headCommit"],
        properties: {
          status: {
            enum: [
              "committed",
              "duplicate",
              "conflict",
              "idempotency-conflict",
              "missing-intent",
              "commit-conflict"
            ]
          },
          commit: { type: "string" },
          headCommit: { type: ["string", "null"] },
          snapshot: { $ref: "#/components/schemas/SnapshotCommit" }
        },
        additionalProperties: true
      },
      PullResponse: {
        type: "object",
        required: ["status", "headCommit", "snapshot"],
        properties: {
          status: { enum: ["empty", "up-to-date", "snapshot", "missing-snapshot"] },
          headCommit: { type: ["string", "null"] },
          snapshot: {
            anyOf: [{ $ref: "#/components/schemas/SnapshotCommit" }, { type: "null" }]
          }
        },
        additionalProperties: false
      },
      SnapshotCommit: {
        type: "object",
        required: [
          "commit",
          "parentCommit",
          "objectKey",
          "ciphertextSha256",
          "ciphertextSize",
          "repoKeyVersion",
          "createdAt"
        ],
        properties: {
          commit: { $ref: "#/components/schemas/OpaqueId" },
          parentCommit: { type: ["string", "null"] },
          objectKey: { type: "string" },
          ciphertextSha256: { $ref: "#/components/schemas/Sha256Hex" },
          ciphertextSize: { type: "integer", minimum: 0 },
          repoKeyVersion: { type: "integer", minimum: 1 },
          createdAt: { type: "string", format: "date-time" }
        },
        additionalProperties: false
      },
      BlobUploadResponse: {
        type: "object",
        required: ["objectKey", "ciphertextSha256"],
        properties: {
          objectKey: { type: "string" },
          ciphertextSha256: { $ref: "#/components/schemas/Sha256Hex" }
        },
        additionalProperties: false
      },
      AuthorizationDecision: {
        type: "object",
        required: ["allowed", "reason"],
        properties: {
          allowed: { type: "boolean" },
          reason: { type: "string" }
        },
        additionalProperties: false
      },
      EnvelopeValidationResponse: {
        type: "object",
        required: ["valid", "reasons"],
        properties: {
          valid: { type: "boolean" },
          reasons: { type: "array", items: { type: "string" } }
        },
        additionalProperties: false
      },
      RotationResponse: {
        type: "object",
        required: ["queued", "rotationId"],
        properties: {
          queued: { type: "boolean" },
          rotationId: { $ref: "#/components/schemas/OpaqueId" }
        },
        additionalProperties: false
      },
      GithubWebhookResponse: {
        type: "object",
        properties: {
          queued: { type: "boolean" },
          duplicate: { type: "boolean" },
          reason: { type: "string" },
          deliveryId: { type: "string" }
        },
        additionalProperties: false
      },
      ConsumeTokenRequest: {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string", minLength: 16 },
          browserFingerprintHash: { type: "string", minLength: 16 },
          ipAddress: { type: "string" }
        },
        additionalProperties: false
      },
      PushIntentRequest: {
        type: "object",
        required: ["expectedHead", "nextCommit", "idempotencyKey"],
        properties: {
          expectedHead: { type: ["string", "null"] },
          nextCommit: { $ref: "#/components/schemas/OpaqueId" },
          idempotencyKey: { $ref: "#/components/schemas/OpaqueId" },
          payloadFingerprint: { $ref: "#/components/schemas/Sha256Hex" }
        },
        additionalProperties: false
      },
      PushCommitRequest: {
        type: "object",
        required: [
          "expectedHead",
          "commitId",
          "parentCommitId",
          "idempotencyKey",
          "objectKey",
          "ciphertextSha256",
          "ciphertextSize",
          "repoKeyVersion"
        ],
        properties: {
          expectedHead: { type: ["string", "null"] },
          commitId: { $ref: "#/components/schemas/OpaqueId" },
          parentCommitId: { type: ["string", "null"] },
          idempotencyKey: { $ref: "#/components/schemas/OpaqueId" },
          payloadFingerprint: { $ref: "#/components/schemas/Sha256Hex" },
          objectKey: { type: "string" },
          ciphertextSha256: { $ref: "#/components/schemas/Sha256Hex" },
          ciphertextSize: { type: "integer", minimum: 0 },
          repoKeyVersion: { type: "integer", minimum: 1 },
          createdAt: { type: "string", format: "date-time" }
        },
        additionalProperties: false
      },
      PullRequest: {
        type: "object",
        properties: {
          knownHead: { type: ["string", "null"] }
        },
        additionalProperties: false
      },
      ServiceAccountAuthorizeRequest: {
        type: "object",
        required: ["status", "allowedBranches", "capabilities", "branchName", "operation", "now"],
        properties: {
          status: { enum: ["active", "suspended", "revoked"] },
          expiresAt: { type: "string", format: "date-time" },
          revokedAt: { type: "string", format: "date-time" },
          allowedBranches: { type: "array", items: { type: "string" } },
          capabilities: { enum: ["pull-only", "push-and-pull"] },
          branchName: { type: "string" },
          operation: {
            enum: ["pull", "push", "manage-membership", "change-policy", "rotate-key"]
          },
          now: { type: "string", format: "date-time" }
        },
        additionalProperties: false
      },
      EnvelopeValidationRequest: {
        type: "object",
        required: ["envelope"],
        properties: {
          envelope: { type: "object" }
        },
        additionalProperties: false
      },
      RotationRequest: {
        type: "object",
        required: ["rotationId", "scopeType", "scopeId"],
        properties: {
          rotationId: { $ref: "#/components/schemas/OpaqueId" },
          scopeType: { enum: ["team", "repo"] },
          scopeId: { $ref: "#/components/schemas/OpaqueId" }
        },
        additionalProperties: false
      },
      OpaqueId: {
        type: "string",
        pattern: "^[A-Za-z0-9_-]{16,128}$"
      },
      Sha256Hex: {
        type: "string",
        pattern: "^[a-f0-9]{64}$"
      }
    }
  },
  paths: {
    "/openapi.json": {
      get: {
        operationId: "getOpenApiDocument",
        summary: "OpenAPI 3.1 document",
        responses: {
          "200": {
            description: "OpenAPI 3.1 document"
          },
          "500": jsonResponse("ErrorResponse")
        }
      }
    },
    "/health": {
      get: {
        operationId: "getHealth",
        summary: "Health check",
        responses: {
          "200": jsonResponse("HealthResponse"),
          "500": jsonResponse("ErrorResponse")
        }
      }
    },
    "/v1/auth/magic-link/consume": {
      post: {
        operationId: "consumeMagicLink",
        summary: "Consume a single-use magic link token",
        requestBody: jsonContent("ConsumeTokenRequest"),
        responses: {
          "200": jsonResponse("ConsumeTokenResponse"),
          ...errorResponses
        }
      }
    },
    "/v1/repos/{repoId}/branches/{branch}/push/intent": {
      post: {
        operationId: "createPushIntent",
        summary: "Serialize and validate a branch push intent",
        security: [{ bearerAuth: [] }],
        requestBody: jsonContent("PushIntentRequest"),
        responses: {
          "200": jsonResponse("PushIntentResponse"),
          ...errorResponses
        }
      }
    },
    "/v1/repos/{repoId}/branches/{branch}/push/commit": {
      post: {
        operationId: "commitBranchPush",
        summary: "Finalize an encrypted snapshot push after blob upload",
        security: [{ bearerAuth: [] }],
        requestBody: jsonContent("PushCommitRequest"),
        responses: {
          "200": jsonResponse("PushCommitResponse"),
          ...errorResponses
        }
      }
    },
    "/v1/repos/{repoId}/branches/{branch}/pull": {
      post: {
        operationId: "pullBranchSnapshot",
        summary: "Read the latest encrypted snapshot metadata for a branch",
        security: [{ bearerAuth: [] }],
        requestBody: jsonContent("PullRequest"),
        responses: {
          "200": jsonResponse("PullResponse"),
          ...errorResponses
        }
      }
    },
    "/v1/blobs/{commitId}": {
      put: {
        operationId: "uploadSnapshotBlob",
        summary: "Upload encrypted snapshot bytes to R2",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "commitId",
            in: "path",
            required: true,
            schema: { $ref: "#/components/schemas/OpaqueId" }
          },
          {
            name: "x-wenvy-repo-id",
            in: "header",
            required: true,
            schema: { $ref: "#/components/schemas/OpaqueId" }
          },
          {
            name: "x-wenvy-branch",
            in: "header",
            required: true,
            schema: { type: "string", minLength: 1 }
          },
          {
            name: "x-ciphertext-sha256",
            in: "header",
            required: true,
            schema: { $ref: "#/components/schemas/Sha256Hex" }
          }
        ],
        responses: {
          "200": jsonResponse("BlobUploadResponse"),
          ...errorResponses
        }
      }
    },
    "/v1/service-accounts/authorize": {
      post: {
        operationId: "authorizeServiceAccount",
        summary: "Evaluate service account operation authorization",
        requestBody: jsonContent("ServiceAccountAuthorizeRequest"),
        responses: {
          "200": jsonResponse("AuthorizationDecision"),
          ...errorResponses
        }
      }
    },
    "/v1/envelopes/validate": {
      post: {
        operationId: "validateEnvelope",
        summary: "Validate encrypted envelope metadata boundary",
        requestBody: jsonContent("EnvelopeValidationRequest"),
        responses: {
          "200": jsonResponse("EnvelopeValidationResponse"),
          ...errorResponses
        }
      }
    },
    "/v1/rotations": {
      post: {
        operationId: "startRotation",
        summary: "Queue a checkpointed key rotation workflow",
        security: [{ bearerAuth: [] }],
        requestBody: jsonContent("RotationRequest"),
        responses: {
          "200": jsonResponse("RotationResponse"),
          ...errorResponses
        }
      }
    },
    "/webhooks/github": {
      post: {
        operationId: "receiveGithubWebhook",
        summary: "Receive signed GitHub App webhook",
        security: [{ githubWebhookSignature: [] }],
        responses: {
          "200": jsonResponse("GithubWebhookResponse"),
          "202": jsonResponse("GithubWebhookResponse"),
          ...errorResponses
        }
      }
    }
  }
} satisfies OpenApiDocument;
