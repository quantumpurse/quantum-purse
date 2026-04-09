import * as ed from "@noble/ed25519";
import QuantumPurse from "./quantum_purse";

const DAO_SERVER_URL = "http://localhost:8080";

// ---------------------------------------------------------------------------
// Types matching the BE's AddressBindingActivity and session response.
// ---------------------------------------------------------------------------

export interface AddressBindingActivity {
	activity_type: string;
	activity_hash: string;
	previous_hash: string | null;
	user_id: string;
	user_proof: string | null;
	server_proof: string | null;
	ckb_block_height: number | null;
	ckb_addresses: string[];
	bind_signatures: string[];
	is_binding: boolean;
	created_at: string;
	expired_at: string;
}

export interface AccountInfo {
	user_id: string;
	username: string;
	email: string;
}

export interface BindingSessionResponse {
	success: boolean;
	payload: AddressBindingActivity;
	account_info: AccountInfo;
	message: string;
}

// ---------------------------------------------------------------------------
// Hex / SHA-256 utilities (no extra dependencies — uses Web Crypto).
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function sha256(data: Uint8Array): Promise<string> {
	// Copy into a plain ArrayBuffer to satisfy TS 5.9's stricter BufferSource
	// typing (Uint8Array.buffer is ArrayBufferLike which includes SharedArrayBuffer).
	const buf = new ArrayBuffer(data.length);
	new Uint8Array(buf).set(data);
	const hash = await crypto.subtle.digest("SHA-256", buf);
	return bytesToHex(new Uint8Array(hash));
}

// ---------------------------------------------------------------------------
// Activity hash computation — replicates BE's compute_hash() byte-for-byte.
// ---------------------------------------------------------------------------

/**
 * Rebuild the activity hash from deterministic fields. The result must match
 * `payload.activity_hash` produced by the BE. Any mismatch indicates the
 * payload was tampered with or there is a format bug.
 *
 * Hash formula (all fields encoded as UTF-8 bytes unless noted):
 *   sha256(
 *     activity_type ||
 *     previous_hash (or "") ||
 *     user_id ||
 *     ckb_block_height as i64 LE bytes (0 if null) ||
 *     address_1 || address_2 || ... ||
 *     is_binding as u8 (0x01 or 0x00) ||
 *     created_at ||
 *     expired_at
 *   )
 */
async function computeActivityHash(
	payload: AddressBindingActivity,
): Promise<string> {
	const encoder = new TextEncoder();
	const parts: Uint8Array[] = [];

	// activity_type
	parts.push(encoder.encode(payload.activity_type));

	// previous_hash (empty string if null)
	parts.push(encoder.encode(payload.previous_hash ?? ""));

	// user_id as UUID string
	parts.push(encoder.encode(payload.user_id));

	// ckb_block_height as i64 little-endian (8 bytes)
	const heightBuf = new ArrayBuffer(8);
	new DataView(heightBuf).setBigInt64(
		0,
		BigInt(payload.ckb_block_height ?? 0),
		true,
	);
	parts.push(new Uint8Array(heightBuf));

	// Each address
	for (const addr of payload.ckb_addresses) {
		parts.push(encoder.encode(addr));
	}

	// is_binding as single u8 byte
	parts.push(new Uint8Array([payload.is_binding ? 1 : 0]));

	// created_at and expired_at: chrono 0.4's serde Serialize uses Debug format
	// (T separator: "2024-01-15T10:30:45"), but compute_hash() uses Display
	// (space separator: "2024-01-15 10:30:45"). Convert T→space to match.
	parts.push(encoder.encode(payload.created_at.replace("T", " ")));
	parts.push(encoder.encode(payload.expired_at.replace("T", " ")));

	// Concatenate all parts into a single buffer.
	const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
	const combined = new Uint8Array(totalLength);
	let offset = 0;
	for (const part of parts) {
		combined.set(part, offset);
		offset += part.length;
	}

	return sha256(combined);
}

// ---------------------------------------------------------------------------
// Server public key.
// ---------------------------------------------------------------------------

/** Fetch the server's ed25519 public key (64 hex chars) for proof verification. */
export async function fetchServerPublicKey(): Promise<string> {
	const response = await fetch(`${DAO_SERVER_URL}/config/server-public-key`);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch server public key: ${response.status}`,
		);
	}

	const data = await response.json();
	return data.public_key;
}

// ---------------------------------------------------------------------------
// Payload verification — the wallet's active verification step.
// ---------------------------------------------------------------------------

/**
 * Verify the binding activity returned by the server. Throws on any failure.
 *
 * Checks performed:
 * 1. Rebuild activity_hash and compare to payload.
 * 2. All payload addresses are a subset of what the wallet sent.
 * 3. is_binding is true (prevents signing an unbinding activity).
 * 4. expired_at is in the future.
 * 5. server_proof is a valid ed25519 signature over activity_hash,
 *    signed by the expected server public key.
 */
export async function verifyBindingPayload(
	payload: AddressBindingActivity,
	sentAddresses: string[],
	serverPublicKeyHex: string,
): Promise<void> {
	// 1. Rebuild and compare activity_hash.
	const rebuiltHash = await computeActivityHash(payload);
	if (rebuiltHash !== payload.activity_hash) {
		throw new Error(
			"Activity hash mismatch: the server's payload does not match its " +
			"declared hash. The data may have been tampered with.",
		);
	}

	// 2. Verify addresses are a subset of what the wallet sent.
	const sentSet = new Set(sentAddresses);
	for (const addr of payload.ckb_addresses) {
		if (!sentSet.has(addr)) {
			throw new Error(
				`Server returned an address the wallet did not send: ${addr}`,
			);
		}
	}

	// 3. Verify is_binding is true because from the wallet side, only binding events come out.
	if (!payload.is_binding) {
		throw new Error(
			"Server returned an unbinding activity — refusing to sign.",
		);
	}

	// 4. Verify activity hasn't expired.
	// Chrono's serde serializes NaiveDateTime as "YYYY-MM-DDTHH:MM:SS.ffffff"
	// (no timezone). Append "Z" to parse as UTC.
	const expiredAt = new Date(payload.expired_at + "Z");
	if (expiredAt <= new Date()) {
		throw new Error(
			"The binding activity has already expired. Please retry.",
		);
	}

	// 5. Verify server_proof: ed25519 signature over activity_hash.
	if (!payload.server_proof || payload.server_proof.length !== 192) {
		throw new Error("Missing or malformed server proof.");
	}

	const sigBytes = hexToBytes(payload.server_proof.substring(0, 128));
	const pubBytes = hexToBytes(payload.server_proof.substring(128));

	// Verify the public key in the proof matches the known server key.
	const expectedPubBytes = hexToBytes(serverPublicKeyHex);
	if (bytesToHex(pubBytes) !== bytesToHex(expectedPubBytes)) {
		throw new Error(
			"Server proof was signed by an unknown key — expected the " +
			"server's public key.",
		);
	}

	// Verify the ed25519 signature over the activity_hash string.
	const msgBytes = new TextEncoder().encode(payload.activity_hash);
	const valid = await ed.verifyAsync(sigBytes, msgBytes, pubBytes);
	if (!valid) {
		throw new Error(
			"Server proof signature verification failed. The activity hash " +
			"may have been tampered with.",
		);
	}
}

// ---------------------------------------------------------------------------
// Challenge derivation — matches BE's services/address_binding.rs logic.
// ---------------------------------------------------------------------------

/** Derive the per-address challenge: sha256(activity_hash || address). */
async function deriveChallenge(
	activityHash: string,
	address: string,
): Promise<string> {
	const encoder = new TextEncoder();
	const hashBytes = encoder.encode(activityHash);
	const addrBytes = encoder.encode(address);

	const combined = new Uint8Array(hashBytes.length + addrBytes.length);
	combined.set(hashBytes, 0);
	combined.set(addrBytes, hashBytes.length);

	return sha256(combined);
}

// ---------------------------------------------------------------------------
// Public API — called by the wallet UI.
// ---------------------------------------------------------------------------

/** Request a binding session from the BE. Returns the raw server response. */
export async function createBindingSession(
	apiKey: string,
	addresses: string[],
): Promise<BindingSessionResponse> {
	const response = await fetch(
		`${DAO_SERVER_URL}/governance/address-binding/session`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				addresses_to_bind: addresses,
			}),
		},
	);

	if (!response.ok) {
		const error = await response.json().catch(() => ({ message: response.statusText }));
		throw new Error(error.message || `Server error: ${response.status}`);
	}

	return response.json();
}

/**
 * Complete the address binding process:
 * 1. Derive per-address challenges from the activity hash.
 * 2. Sign each challenge with the corresponding address's private key.
 * 3. Fill bind_signatures in the activity and submit to the BE.
 */
export async function completeBinding(
	apiKey: string,
	payload: AddressBindingActivity,
	lockArgsList: string[],
	quantumPurse: QuantumPurse,
) {
	// Step 1: Derive challenges for each address.
	const challenges = await Promise.all(
		payload.ckb_addresses.map((addr) =>
			deriveChallenge(payload.activity_hash, addr),
		),
	);

	// Step 2: Sign all challenges in batch with a single password request.
	const messagesToSign = challenges.map((challenge, i) => ({
		message: challenge,
		lockArgs: lockArgsList[i],
	}));

	const signatures =
		await quantumPurse.signXXXMessagesBatch(messagesToSign);

	// Step 3: Fill bind_signatures and send the complete activity.
	const completedActivity: AddressBindingActivity = {
		...payload,
		bind_signatures: signatures,
	};

	const verifyResponse = await fetch(
		`${DAO_SERVER_URL}/governance/address-binding/verify`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(completedActivity),
		},
	);

	if (!verifyResponse.ok) {
		const error = await verifyResponse.json().catch(() => ({ message: verifyResponse.statusText }));
		throw new Error(error.message || `Verification failed: ${verifyResponse.status}`);
	}

	return verifyResponse.json();
}
