import { expect } from "chai";
import { schnorr } from "@noble/curves/secp256k1";
import { extractAccountPubkey, AddressBindingEvent } from "../src/core/daov2/dao_v2";
import { bytesToHex } from "../src/core/daov2/hash_builder";

// Cross-implementation known-answer vector (BACKLOG #6). The same fixture is
// pinned in `ckb-dao-v2-code/event-models/src/events/address_binding.rs` and
// `ckb-dao-v2-code/frontend/src/crypto/address_binding_hash.test.ts` — all
// three hashers must produce this digest or binding verification breaks.
const VECTOR_HASH =
  "5419dae0afb90b318057c1461527e4775cdbc219069b57883a6c623e597a2581";

const ACCOUNT_PUBKEY = "aa".repeat(32);
const SECRET = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6";
const COMPOSITE = `dao_${ACCOUNT_PUBKEY}_${SECRET}`;

// A real Schnorr server proof over the message, so verification exercises
// the full path (hash rebuild + proof check) instead of a mocked one.
function serverProofFor(message: string) {
  const priv = new Uint8Array(32).fill(7);
  const pub = schnorr.getPublicKey(priv);
  const sig = schnorr.sign(new TextEncoder().encode(message), priv);
  return {
    proof: bytesToHex(sig) + bytesToHex(pub),
    pubkeyHex: bytesToHex(pub),
  };
}

// The exact fixture the vector hash covers (serde emits NaiveDateTime with a
// "T" separator; the model normalizes it to chrono's space-separated form).
function vectorPayload(overrides: Record<string, unknown> = {}) {
  return {
    event_type: "address_bindings",
    event_hash: VECTOR_HASH,
    user_id: "123e4567-e89b-12d3-a456-426614174000",
    account_pubkey: ACCOUNT_PUBKEY,
    user_proof: null,
    server_proof: null as string | null,
    ckb_block_height: 12345678,
    ckb_addresses: ["ckt1qexample1", "ckt1qexample2"],
    bind_signatures: [],
    is_binding: true,
    created_at: "2026-01-02T03:04:05",
    expired_at: "2026-01-02T03:04:25",
    ...overrides,
  };
}

describe("DAO v2 binding", () => {
  describe("extractAccountPubkey", () => {
    it("extracts the pubkey from a well-formed composite key", () => {
      expect(extractAccountPubkey(COMPOSITE)).to.eq(ACCOUNT_PUBKEY);
    });

    it("rejects malformed input", () => {
      const bad = [
        "",
        SECRET, // legacy bare secret
        `dao_${ACCOUNT_PUBKEY}`, // missing secret
        `dao_${ACCOUNT_PUBKEY}_${SECRET.slice(1)}`, // truncated secret
        `dao_${ACCOUNT_PUBKEY.slice(2)}_${SECRET}`, // truncated pubkey
        `dao_${ACCOUNT_PUBKEY.toUpperCase()}_${SECRET}`, // uppercase hex
        `dao_${ACCOUNT_PUBKEY}_${SECRET}x`, // trailing garbage
        ` dao_${ACCOUNT_PUBKEY}_${SECRET}`, // leading whitespace
      ];
      for (const input of bad) {
        expect(() => extractAccountPubkey(input), JSON.stringify(input)).to.throw();
      }
    });
  });

  describe("event hash (cross-implementation vector)", () => {
    it("accepts the payload whose declared hash is the known vector", async () => {
      const { proof, pubkeyHex } = serverProofFor(VECTOR_HASH);
      // verify() checks hash + server proof (no expiry) — it must accept
      // the exact vector fixture even though its dates are in the past.
      await AddressBindingEvent.verify(
        vectorPayload({ server_proof: proof }),
        pubkeyHex,
      );
    });

    it("rejects when account_pubkey differs (hash no longer matches)", async () => {
      const { proof, pubkeyHex } = serverProofFor(VECTOR_HASH);
      const payload = vectorPayload({
        account_pubkey: "bb".repeat(32),
        server_proof: proof,
      });
      try {
        await AddressBindingEvent.verify(payload, pubkeyHex);
        expect.fail("verify() should have thrown on a tampered account_pubkey");
      } catch (error) {
        expect(String(error)).to.match(/hash mismatch/i);
      }
    });
  });

  describe("verifyBinding account key gate (consensus-critical)", () => {
    it("refuses to sign when the event's key differs from the pasted key", async () => {
      // A hash-consistent, server-signed event that empowers a key other
      // than the one decoded from the pasted composite. The gate must
      // refuse before the wallet produces any SPHINCS+ signature. It also
      // fires before the expiry check, so the past-dated fixture is fine.
      const { proof, pubkeyHex } = serverProofFor(VECTOR_HASH);
      const payload = vectorPayload({ server_proof: proof });
      try {
        await AddressBindingEvent.verifyBinding(
          payload,
          pubkeyHex,
          ["ckt1qexample1", "ckt1qexample2"],
          "cc".repeat(32), // pasted key differs from event.account_pubkey
          null, // no synced tip; the key gate fires long before the height check
        );
        expect.fail("verifyBinding() should have refused the key mismatch");
      } catch (error) {
        expect(String(error)).to.match(/different account key/i);
      }
    });
  });

  /**
   * The server stamps ckb_block_height and it is inside the hash the SPHINCS+
   * keys sign. The expiry check cannot catch a stale one: a challenge can
   * carry an honest expired_at and still point at an old block. Only a tip the
   * server did not supply settles it, and this wallet runs a light client.
   *
   * The vector fixture is past-dated, so Date.now is pinned inside its window
   * to reach the height check without changing any hashed field.
   */
  describe("verifyBinding block height gate", () => {
    const VECTOR_HEIGHT = 12345678;
    const INSIDE_WINDOW = Date.parse("2026-01-02T03:04:10Z");
    let realNow: () => number;

    beforeEach(() => {
      realNow = Date.now;
      Date.now = () => INSIDE_WINDOW;
    });

    afterEach(() => {
      Date.now = realNow;
    });

    async function verifyWithTip(localTip: bigint | null) {
      const { proof, pubkeyHex } = serverProofFor(VECTOR_HASH);
      await AddressBindingEvent.verifyBinding(
        vectorPayload({ server_proof: proof }),
        pubkeyHex,
        ["ckt1qexample1", "ckt1qexample2"],
        ACCOUNT_PUBKEY,
        localTip,
      );
    }

    it("accepts a height equal to the wallet's own tip", async () => {
      await verifyWithTip(BigInt(VECTOR_HEIGHT));
    });

    // The light client trails the chain, so an honest server is normally a
    // little ahead; both directions are allowed up to the tolerance.
    it("accepts a height up to 2 blocks from the tip, either way", async () => {
      await verifyWithTip(BigInt(VECTOR_HEIGHT - 2));
      await verifyWithTip(BigInt(VECTOR_HEIGHT + 2));
    });

    it("refuses a height further behind the tip than the tolerance", async () => {
      try {
        await verifyWithTip(BigInt(VECTOR_HEIGHT + 3));
        expect.fail("verifyBinding() should have refused the stale height");
      } catch (error) {
        expect(String(error)).to.match(/block height/i);
      }
    });

    it("refuses a height further ahead of the tip than the tolerance", async () => {
      try {
        await verifyWithTip(BigInt(VECTOR_HEIGHT - 3));
        expect.fail("verifyBinding() should have refused the future height");
      } catch (error) {
        expect(String(error)).to.match(/block height/i);
      }
    });

    /**
     * Before a peer answers, the wallet has no view of the chain. That must
     * block signing rather than wave the binding through — otherwise a
     * compromised server simply waits for a wallet with nothing to check
     * against.
     */
    it("refuses to sign when the wallet has no tip yet", async () => {
      try {
        await verifyWithTip(null);
        expect.fail("verifyBinding() should have refused without a tip");
      } catch (error) {
        expect(String(error)).to.match(/not synced/i);
      }
    });
  });
});
