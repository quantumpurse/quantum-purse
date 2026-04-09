import * as ed from "@noble/ed25519";
import { hexToBytes, bytesToHex } from "./hash_builder";

/// Ed25519 signature (64 bytes) + public key (32 bytes) concatenated as hex.
/// Wire format: `<128-char signature hex><64-char public key hex>` = 192 hex chars.
///
/// A self-contained cryptographic proof — anyone can verify it without a
/// separate public key lookup. Used for both user proofs (passkey PRF-derived)
/// and server proofs (server signing key).
///
/// Mirrors BE's `crypto/ed25519_proof.rs`.

const PROOF_HEX_LEN = 192; // 128 (sig) + 64 (pubkey)

export class Ed25519Proof {
	readonly signature: Uint8Array; // 64 bytes
	readonly publicKey: Uint8Array; // 32 bytes

	private constructor(signature: Uint8Array, publicKey: Uint8Array) {
		this.signature = signature;
		this.publicKey = publicKey;
	}

	/** Parse a 192-character hex string into an Ed25519Proof. */
	static fromHex(hexStr: string): Ed25519Proof {
		if (hexStr.length !== PROOF_HEX_LEN) {
			throw new Error(
				`Ed25519 proof must be ${PROOF_HEX_LEN} hex characters (got ${hexStr.length}).`,
			);
		}

		const signature = hexToBytes(hexStr.substring(0, 128));
		const publicKey = hexToBytes(hexStr.substring(128));
		return new Ed25519Proof(signature, publicKey);
	}

	/** Encode as a 192-character hex string. */
	toHex(): string {
		return bytesToHex(this.signature) + bytesToHex(this.publicKey);
	}

	/** Return the public key as a 64-character hex string. */
	publicKeyHex(): string {
		return bytesToHex(this.publicKey);
	}

	/** Verify that this proof's signature is valid for the given message. */
	async verify(message: string): Promise<void> {
		const msgBytes = new TextEncoder().encode(message);
		const valid = await ed.verifyAsync(this.signature, msgBytes, this.publicKey);
		if (!valid) {
			throw new Error(
				"Ed25519 signature verification failed. The data may have been tampered with.",
			);
		}
	}

	/**
	 * Verify this proof's signature and that the public key matches an
	 * expected key (e.g., the server's known public key).
	 */
	async verifyWithKey(message: string, expectedPublicKeyHex: string): Promise<void> {
		if (this.publicKeyHex() !== expectedPublicKeyHex) {
			throw new Error(
				"Proof was signed by an unknown key — expected public key does not match.",
			);
		}
		await this.verify(message);
	}
}
