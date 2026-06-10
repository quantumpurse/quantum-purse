import QuantumPurse from "../quantum_purse";
import { AddressBindingEvent } from "./address_binding";
import { HashBuilder } from "./hash_builder";

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

/** Derive the per-address challenge: sha256(event_hash || address). */
function deriveChallenge(eventHash: string, address: string): Promise<string> {
	return new HashBuilder().str(eventHash).str(address).digest();
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
 * 1. Derive per-address challenges from the event hash.
 * 2. Sign each challenge with the corresponding address's private key.
 * 3. Fill bind_signatures in the event and submit to the BE.
 *
 * Supports selective binding: `selectedIndices` specifies which addresses
 * (by index into payload.ckb_addresses) the user chose to bind. Unselected
 * addresses get an empty string in bind_signatures. If omitted, all
 * addresses are signed (backward-compatible).
 */
export async function completeBinding(
	apiKey: string,
	payload: AddressBindingEvent,
	lockArgsList: string[],
	quantumPurse: QuantumPurse,
	selectedIndices?: number[],
) {
	// Determine which addresses to sign.
	const selected = selectedIndices
		? new Set(selectedIndices)
		: new Set(payload.ckb_addresses.map((_, i) => i));

	// Step 1: Derive challenges only for selected addresses.
	const messagesToSign: { message: string; lockArgs: string }[] = [];
	const signIndexMap: number[] = [];

	for (const i of selected) {
		const challenge = await deriveChallenge(payload.event_hash, payload.ckb_addresses[i]);
		messagesToSign.push({ message: challenge, lockArgs: lockArgsList[i] });
		signIndexMap.push(i);
	}

	// Step 2: Sign selected challenges in batch with a single password request.
	const signatures = await quantumPurse.signXXXMessagesBatch(messagesToSign);

	// Step 3: Build bind_signatures array with empty strings for unselected.
	const bindSignatures: string[] = payload.ckb_addresses.map(() => "");
	for (let j = 0; j < signIndexMap.length; j++) {
		bindSignatures[signIndexMap[j]] = signatures[j];
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
