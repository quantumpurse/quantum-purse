import QuantumPurse from "../quantum_purse";
import { AddressBindingEvent } from "./address_binding";
import { HashBuilder, hexToBytes } from "./hash_builder";
import { SchnorrProof } from "./schnorr_proof";
import type { AppendAck } from "./receipt";

// Re-export so existing callers can import from this module.
export { AddressBindingEvent };

const DAO_SERVER_URL = "http://localhost:8080";

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

/** Fetch the server's Schnorr public key (64 hex chars) for proof verification. */
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

	const serverKey = await fetchServerPublicKey();
	await SchnorrProof.fromHex(ack.attestation).verifyWithKey(digest, serverKey);
}
