#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import {
  assertDataRole,
  canonicalizeEnvSnapshot,
  evaluateBranchAccess,
  type BranchOperation,
  type BranchPolicy
} from "@wenvy/domain";

const program = new Command()
  .name("wenvy")
  .description("TypeScript terminal client for Wenvy encrypted environment state")
  .version("0.1.0");

program
  .command("snapshot:canonicalize")
  .argument("<env-file>")
  .description("Print canonical env snapshot bytes for regression/debugging")
  .action(async (envFile: string) => {
    const input = await readFile(envFile, "utf8");
    const snapshot = await canonicalizeEnvSnapshot(input);
    process.stdout.write(snapshot.canonicalText);
  });

program
  .command("snapshot:hash")
  .argument("<env-file>")
  .description("Print SHA-256 hash of canonical env snapshot bytes")
  .action(async (envFile: string) => {
    const input = await readFile(envFile, "utf8");
    const snapshot = await canonicalizeEnvSnapshot(input);
    process.stdout.write(`${snapshot.sha256Hex}\n`);
  });

program
  .command("policy:check")
  .requiredOption("--role <role>")
  .requiredOption("--branch <branch>")
  .requiredOption("--operation <operation>")
  .requiredOption("--policy-file <policy-file>")
  .description("Evaluate a branch policy decision from a JSON policy file")
  .action(
    async (options: {
      readonly role: string;
      readonly branch: string;
      readonly operation: BranchOperation;
      readonly policyFile: string;
    }) => {
      assertDataRole(options.role);
      const policyText = await readFile(options.policyFile, "utf8");
      const policies = JSON.parse(policyText) as BranchPolicy[];
      const decision = evaluateBranchAccess({
        role: options.role,
        branchName: options.branch,
        operation: options.operation,
        policies
      });
      process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
    }
  );

await program.parseAsync();
