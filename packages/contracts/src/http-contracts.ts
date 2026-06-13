import { z } from "zod";

export const opaqueIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/u);
export const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const snapshotObjectKeySchema = z
  .string()
  .regex(/^snapshots\/[a-f0-9]{2}\/[A-Za-z0-9_-]{16,128}\/[a-f0-9]{64}\.enc$/u);
export const dataRoleSchema = z.enum(["none", "viewer", "editor", "admin", "owner"]);
export const branchOperationSchema = z.enum(["read", "write", "merge", "change-policy", "delete"]);

export const consumeTokenRequestSchema = z.object({
  token: z.string().min(16),
  browserFingerprintHash: z.string().min(16).optional(),
  ipAddress: z.string().optional()
});

export const pushIntentRequestSchema = z.object({
  expectedHead: z.string().min(1).nullable(),
  nextCommit: opaqueIdSchema,
  idempotencyKey: opaqueIdSchema,
  payloadFingerprint: sha256HexSchema.optional()
});

export const pushCommitRequestSchema = z.object({
  expectedHead: z.string().min(1).nullable(),
  commitId: opaqueIdSchema,
  parentCommitId: z.string().min(1).nullable(),
  idempotencyKey: opaqueIdSchema,
  payloadFingerprint: sha256HexSchema.optional(),
  objectKey: snapshotObjectKeySchema,
  ciphertextSha256: sha256HexSchema,
  ciphertextSize: z.number().int().nonnegative(),
  repoKeyVersion: z.number().int().positive(),
  createdAt: z.string().datetime().optional()
});

export const pullRequestSchema = z.object({
  knownHead: z.string().min(1).nullable().optional()
});

export const serviceAccountAuthorizeRequestSchema = z.object({
  status: z.enum(["active", "suspended", "revoked"]),
  expiresAt: z.string().datetime().optional(),
  revokedAt: z.string().datetime().optional(),
  allowedBranches: z.array(z.string().min(1)),
  capabilities: z.enum(["pull-only", "push-and-pull"]),
  branchName: z.string().min(1),
  operation: z.enum(["pull", "push", "manage-membership", "change-policy", "rotate-key"]),
  now: z.string().datetime()
});

export const envelopeValidationRequestSchema = z.object({
  envelope: z.record(z.string(), z.unknown())
});

export const rotationRequestSchema = z.object({
  rotationId: opaqueIdSchema,
  scopeType: z.enum(["team", "repo"]),
  scopeId: opaqueIdSchema
});

export type ConsumeTokenRequest = z.infer<typeof consumeTokenRequestSchema>;
export type PushIntentRequest = z.infer<typeof pushIntentRequestSchema>;
export type PushCommitRequest = z.infer<typeof pushCommitRequestSchema>;
export type PullRequest = z.infer<typeof pullRequestSchema>;
export type ServiceAccountAuthorizeRequest = z.infer<typeof serviceAccountAuthorizeRequestSchema>;
export type EnvelopeValidationRequest = z.infer<typeof envelopeValidationRequestSchema>;
export type RotationRequest = z.infer<typeof rotationRequestSchema>;
