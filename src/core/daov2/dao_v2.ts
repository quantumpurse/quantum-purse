import QuantumPurse from "../quantum_purse";
import { DAO_SERVER_PUBKEY, DAO_SERVER_URL } from "../config";
import { AddressBindingEvent } from "./address_binding";
import { HashBuilder, hexToBytes } from "./hash_builder";
import { SchnorrProof } from "./schnorr_proof";
import type { AppendAck } from "./receipt";

// Re-export so existing callers can import from this module.
export { AddressBindingEvent };

// ---------------------------------------------------------------------------
// Types matching the BE's session response.
// ---------------------------------------------------------------------------

export interface AccountInfo {
	user_id: string;
	username: string;
	email: string;
}

export interface BindingSessionResponse {
	success: boolean;
	payload: AddressBindingEvent;
	account_info: AccountInfo;
	message: string;
}

// ---------------------------------------------------------------------------
// Composite API key: format validation and account-key extraction.
// ---------------------------------------------------------------------------

// Format: dao_<64-hex account_pubkey>_<32-char alphanumeric secret>.
// Mirrors the FE's `crypto/binding_api_key_parser.ts`.
// Only the pubkey is ever extracted: the secret never acts alone — the whole
// composite is the Bearer credential, hashed as one string by the server —
// but its shape stays in the pattern so a truncated paste fails loudly here
// instead of surfacing later as a confusing session-auth rejection.
const API_KEY_PATTERN = /^dao_([0-9a-f]{64})_([A-Za-z0-9]{32})$/;

/// Validate the composite binding API key pasted by the user and return the
/// embedded account public key (64 hex chars). That pubkey is the wallet's
/// only trustworthy source for the account key (the FE verified it against
/// the user's passkey before display), so a malformed paste must fail
/// loudly here — before any network call.
export function extractAccountPubkey(composite: string): string {
	const match = API_KEY_PATTERN.exec(composite);
	if (!match) {
		throw new Error(
			"Malformed API key: expected dao_<64-hex pubkey>_<32-char secret>. " +
				"Re-copy the full key from the DAO website.",
		);
	}
	return match[1];
}

// ---------------------------------------------------------------------------
// Server public key.
// ---------------------------------------------------------------------------

/**
 * Where this wallet keeps the first server key it ever saw. Named in the
 * mismatch error, so someone who regenerated SERVER_PRIVATE_KEY can clear it
 * without having to read this file to find out how.
 */
const SERVER_KEY_STORAGE_KEY = "ckb-dao-v2-server-pubkey";

let cachedServerPublicKey: string | null = null;

/**
 * The key this build was pinned to, or null when it pinned none. Compared
 * without regard to case: both spellings of a hex string are the same 32 bytes,
 * and the value is typed by hand into a build command.
 */
function specifiedServerPublicKey(): string | null {
	const trimmed = DAO_SERVER_PUBKEY.trim();
	return trimmed ? trimmed.toLowerCase() : null;
}

function serverPublicKeyFromStorage(): string | null {
	try {
		return window.localStorage.getItem(SERVER_KEY_STORAGE_KEY);
	} catch {
		return null;
	}
}

/** False when storage is switched off or full, so the caller can say so. */
function storeServerPublicKey(key: string): boolean {
	try {
		window.localStorage.setItem(SERVER_KEY_STORAGE_KEY, key);
		return true;
	} catch {
		return false;
	}
}

/**
 * Fetch the server's public key and check it against an anchor this wallet
 * holds for itself.
 *
 * Fetching the key from the same server whose proofs it verifies settles
 * nothing on its own: a compromised server hands over its own key and its own
 * proofs together, and every signature check then passes. So the fetched key
 * has to agree with something the server did not supply. Two anchors,
 * strongest first:
 *
 *  - `DAO_SERVER_PUBKEY`, pinned into the build. Correct from the very first
 *    request, and needs no storage.
 *  - the first key this wallet ever saw. This cannot catch a server that was
 *    already lying the first time, but it does catch one whose key changes
 *    afterwards — which is what a substituted key looks like from here.
 *
 * Mirrors `getServerPublicKey` in the DAO frontend.
 */
export async function getServerPublicKey(): Promise<string> {
	if (cachedServerPublicKey) return cachedServerPublicKey;

	const response = await fetch(`${DAO_SERVER_URL}/config/server-public-key`);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch server public key: ${response.status}`,
		);
	}
	const data = await response.json();
	if (!data.public_key) {
		throw new Error("Failed to fetch server public key.");
	}

	const key = String(data.public_key).trim();
	const serverPubkey = key.toLowerCase();
	const specifiedKey = specifiedServerPublicKey();

	if (specifiedKey) {
		// The pin is the operator's deliberate statement, so it settles the
		// question by itself — a key left in this wallet by an earlier deployment
		// must not be able to block a correctly pinned build.
		if (serverPubkey !== specifiedKey) {
			throw new Error(
				`SECURITY: the server returned public key ${key}, but this build ` +
					`is pinned to ${specifiedKey}. Refusing to verify anything signed by an ` +
					`unrecognised key — the server may be compromised or misconfigured.`,
			);
		}
		// Keep storage in step with the pin.
		storeServerPublicKey(specifiedKey);
	} else {
		const rememberedKey = serverPublicKeyFromStorage();
		if (rememberedKey === null) {
			if (!storeServerPublicKey(serverPubkey)) {
				// Storage is switched off or full, so this wallet cannot notice the
				// key changing under it. Say so rather than carry on quietly: a check
				// that has stopped running is worse than one that was never there.
				console.warn(
					`Could not store the server's public key under ` +
						`"${SERVER_KEY_STORAGE_KEY}". This wallet will not notice if the ` +
						`key changes. Pin it with DAO_SERVER_PUBKEY to check it properly.`,
				);
			}
		} else if (rememberedKey !== serverPubkey) {
			throw new Error(
				`SECURITY: the server returned public key ${key}, but this ` +
					`wallet remembers ${rememberedKey}. Refusing to verify anything ` +
					`signed by it — the server may be compromised. If this deployment ` +
					`legitimately changed its key, the wallet must be rebuilt with ` +
					`DAO_SERVER_PUBKEY set to the new one.`,
			);
		}
	}

	// Lowercase from here on. Everything downstream compares this against
	// `bytesToHex` output with `!==` (schnorr_proof.ts), and that output is
	// always lowercase — so any other spelling would fail every proof check with
	// a misleading "signed by an unknown key". The errors above keep the
	// server's own spelling, because there the point is what it actually sent.
	cachedServerPublicKey = serverPubkey;
	return serverPubkey;
}

// ---------------------------------------------------------------------------
// Challenge derivation — matches BE's services/address_binding.rs logic.
// ---------------------------------------------------------------------------

/// Derive the per-address challenge: sha256(event_hash || address), each
/// field length-prefixed per Consensus rule 3. Must stay byte-identical to
/// the BE's version in `services/address_binding.rs`.
function deriveChallenge(eventHash: string, address: string): Promise<string> {
	return new HashBuilder().str(eventHash).str(address).digest();
}

// ---------------------------------------------------------------------------
// Public API — called by the wallet UI.
// ---------------------------------------------------------------------------

/**
 * Fetch the addresses this account has already bound.
 *
 * The wallet subtracts these from the addresses it holds and shows the user
 * the rest to choose from. Asking this way — "which are bound?" rather than
 * "is this one bound?" — means the server is never told which addresses the
 * wallet holds, so it cannot name an unbound one to keep it out of the
 * user's choice.
 */
export async function fetchBoundAddresses(
	apiKey: string,
): Promise<{ boundAddresses: string[]; accountInfo: AccountInfo }> {
	const response = await fetch(
		`${DAO_SERVER_URL}/governance/address-binding/wallet/bound-addresses`,
		{ headers: { Authorization: `Bearer ${apiKey}` } },
	);

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ message: response.statusText }));
		throw new Error(error.message || `Server error: ${response.status}`);
	}

	const data = await response.json();
	if (!data.account_info) {
		throw new Error("Invalid response from server — missing account info.");
	}
	return {
		boundAddresses: data.bound_addresses ?? [],
		accountInfo: data.account_info,
	};
}

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
 * 1. Derive per-address challenges from the event hash.
 * 2. Sign each challenge with the corresponding address's private key.
 * 3. Fill bind_signatures in the event and submit to the BE.
 *
 * The user has already chosen their addresses before the session request, so
 * the event lists exactly that choice and every listed address gets signed.
 * Consensus rule 8 forbids an empty slot: a blank used to mean "not selected",
 * which is also what a tamperer's deletion looks like.
 */
export async function completeBinding(
	apiKey: string,
	payload: AddressBindingEvent,
	lockArgsList: string[],
	quantumPurse: QuantumPurse,
) {
	// Step 1: Derive a challenge for every listed address.
	const messagesToSign: { message: string; lockArgs: string }[] = [];
	for (let i = 0; i < payload.ckb_addresses.length; i++) {
		const challenge = await deriveChallenge(payload.event_hash, payload.ckb_addresses[i]);
		messagesToSign.push({ message: challenge, lockArgs: lockArgsList[i] });
	}

	// Step 2: Sign them in batch with a single password request.
	const bindSignatures = await quantumPurse.signXXXMessagesBatch(messagesToSign);

	// One slot per address, all filled. The server and every auditor reject
	// any other shape, so catch it here rather than after the round trip.
	if (bindSignatures.length !== payload.ckb_addresses.length) {
		throw new Error(
			`Signing produced ${bindSignatures.length} signatures for ` +
				`${payload.ckb_addresses.length} addresses — refusing to submit.`,
		);
	}

	const completedEvent = {
		...payload,
		bind_signatures: bindSignatures,
	};

	const verifyResponse = await fetch(
		`${DAO_SERVER_URL}/governance/address-binding/verify`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(completedEvent),
		},
	);

	if (!verifyResponse.ok) {
		const error = await verifyResponse.json().catch(() => ({ message: verifyResponse.statusText }));
		throw new Error(error.message || `Verification failed: ${verifyResponse.status}`);
	}

	const response = await verifyResponse.json();
	return { response, event: completedEvent };
}

// ---------------------------------------------------------------------------
// Append-ack verification — called by the UI after a successful bind, before
// the receipt is downloaded.
// ---------------------------------------------------------------------------

/**
 * Verify the server's ack of an append (Security assumption 1): the attestation
 * must be the server's signature over the checkpoint digest
 * `SHA-256(leaf_index as u64 LE ‖ leaf_hash ‖ mmr_root)` (Consensus rule 4).
 *
 * `eventHash` MUST be the locally held hash of the payload the user signed —
 * never a value echoed by the server — because using it as the leaf hash is
 * what binds the ack to this event. Throws on any failure.
 */
export async function verifyAppendAck(
	eventHash: string,
	ack: AppendAck,
): Promise<void> {
	const digest = await new HashBuilder()
		.i64(ack.leaf_index)
		.bytes(hexToBytes(eventHash))
		.bytes(hexToBytes(ack.mmr_root))
		.digest();

	const serverKey = await getServerPublicKey();
	await SchnorrProof.fromHex(ack.attestation).verifyWithKey(digest, serverKey);
}
