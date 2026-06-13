import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalizeEnvSnapshot } from "@wenvy/domain";

describe("canonical env snapshots", () => {
  it("serializes keys in UTF-8 byte order with a single trailing newline", async () => {
    const snapshot = await canonicalizeEnvSnapshot({
      Z: "zed",
      A: "upper",
      _: "underscore",
      a: "lower"
    });

    expect(snapshot.canonicalText).toBe("A=upper\nZ=zed\n_=underscore\na=lower\n");
    expect(snapshot.sha256Hex).toBe(
      createHash("sha256").update(snapshot.canonicalText).digest("hex")
    );
  });

  it("strips comments and blank lines before hashing", async () => {
    const snapshot = await canonicalizeEnvSnapshot(`
# ignored
DATABASE_URL=postgres://localhost/mydb

API_KEY=sk-abc123
EMPTY=
`);

    expect(snapshot.canonicalText).toBe(
      "API_KEY=sk-abc123\nDATABASE_URL=postgres://localhost/mydb\nEMPTY=\n"
    );
    expect(snapshot.sha256Hex).toBe(
      "d9eb59ce4acc162a0633088059bdd71aeac0381880f8906b7f7e7fbfb75f3964"
    );
  });

  it("base64 encodes values containing equals, newlines, or non-printable bytes", async () => {
    const snapshot = await canonicalizeEnvSnapshot({
      A: "plain",
      EQ: "a=b",
      MULTI: "line1\nline2",
      NUL: "a\0b"
    });

    expect(snapshot.canonicalText).toBe(
      "A=plain\nEQ=b64:YT1i\nMULTI=b64:bGluZTEKbGluZTI=\nNUL=b64:YQBi\n"
    );
    expect(snapshot.sha256Hex).toBe(
      "1c76661f561bc367d751a7ef8166a337578277eaeb71fb34a77e0dc72ff6893e"
    );
  });

  it("produces the same hash for equivalent env states", async () => {
    const fromText = await canonicalizeEnvSnapshot("B=two\nA=one\n");
    const fromRecord = await canonicalizeEnvSnapshot({ A: "one", B: "two" });

    expect(fromText.canonicalText).toBe(fromRecord.canonicalText);
    expect(fromText.sha256Hex).toBe(fromRecord.sha256Hex);
  });
});
