import QuantumPurse from "../quantum_purse";
import { AddressBindingActivity } from "./address_binding";
import { HashBuilder } from "./hash_builder";

// Re-export so existing callers can import from this module.
export { AddressBindingActivity };

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
	payload: AddressBindingActivity;
	account_info: AccountInfo;
	message: string;
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
// Challenge derivation — matches BE's services/address_binding.rs logic.
// ---------------------------------------------------------------------------

/** Derive the per-address challenge: sha256(activity_hash || address). */
function deriveChallenge(activityHash: string, address: string): Promise<string> {
	return new HashBuilder().str(activityHash).str(address).digest();
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
	const completedActivity = {
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

	const response = await verifyResponse.json();
	return { response, activity: completedActivity };
}
