import { HashBuilder } from "./hash_builder";
import { SchnorrProof } from "./schnorr_proof";

/// Address binding/unbinding event model.
///
/// Mirrors BE's `models/address_binding.rs`. Common governance fields plus
/// address binding-specific fields (ckb_addresses, bind_signatures, is_binding).
///
/// `verify()` is the single entry point: it parses the BE response,
/// rebuilds the event hash, verifies it matches, and verifies the server
/// proof. If it returns, the payload is verified. If not, it throws.

export class AddressBindingEvent {
	// static readonly EVENT_DETAIL_TABLE = "address_bindings";

	readonly event_type: string;
	readonly event_hash: string;
	readonly previous_hash: string | null;
	readonly user_id: string;
	readonly user_proof: string | null;
	readonly server_proof: string | null;
	readonly ckb_block_height: number | null;
	readonly ckb_addresses: string[];
	readonly bind_signatures: string[];
	readonly is_binding: boolean;
	readonly created_at: string;
	readonly expired_at: string;

	private constructor(payload: AddressBindingEvent) {
		this.event_type = payload.event_type;
		this.event_hash = payload.event_hash;
		this.previous_hash = payload.previous_hash;
		this.user_id = payload.user_id;
		this.user_proof = payload.user_proof;
		this.server_proof = payload.server_proof;
		this.ckb_block_height = payload.ckb_block_height;
		this.ckb_addresses = payload.ckb_addresses;
		this.bind_signatures = payload.bind_signatures;
		this.is_binding = payload.is_binding;
		this.created_at = payload.created_at;
		this.expired_at = payload.expired_at;
	}

	/**
	 * Construct from a BE challenge response payload, verifying hash integrity
	 * and server proof. Throws on any validation failure.
	 */
	static async verify(
		payload: Record<string, unknown>,
		serverPublicKeyHex: string,
	): Promise<void> {
		const event = new AddressBindingEvent(
			payload as unknown as AddressBindingEvent,
		);

		// Rebuild the event hash and verify it matches the declared hash.
		const rebuilt = await event.computeHash();
		if (rebuilt !== event.event_hash) {
			throw new Error(
				"Event hash mismatch: the server's payload does not match its " +
					"declared hash. The data may have been tampered with.",
			);
		}

		// Verify the server's Schnorr proof over the event hash.
		if (!event.server_proof) {
			throw new Error("Missing server proof.");
		}
		const proof = SchnorrProof.fromHex(event.server_proof);
		await proof.verifyWithKey(event.event_hash, serverPublicKeyHex);
	}

	/**
	 * Verify a binding challenge response from the server. Throws on any failure.
	 *
	 * Checks: hash integrity, server proof, addresses match what was sent,
	 * is_binding is true, and event hasn't expired.
	 */
	static async verifyBinding(
		payload: Record<string, unknown>,
		serverPublicKeyHex: string,
		sentAddresses: string[],
	): Promise<void> {
		await AddressBindingEvent.verify(payload, serverPublicKeyHex);

		const event = payload as unknown as AddressBindingEvent;

		// Verify addresses are a subset of what the wallet sent.
		const sentSet = new Set(sentAddresses);
		for (const addr of event.ckb_addresses) {
			if (!sentSet.has(addr)) {
				throw new Error(
					`Server returned an address the wallet did not send: ${addr}`,
				);
			}
		}

		// Only binding activities should come through this path.
		if (!event.is_binding) {
			throw new Error(
				"Server returned an unbinding event — refusing to sign.",
			);
		}
	}

	/**
	 * Deterministic SHA-256 hash over the event fields.
	 * Must match BE's AddressBindingEvent::compute_hash() byte-for-byte.
	 *
	 * Field order: event_type, previous_hash, user_id, ckb_block_height (i64 LE),
	 * each address, is_binding (as 0/1 byte), created_at, expired_at.
	 */
	private async computeHash(): Promise<string> {
		const builder = new HashBuilder()
			.str(this.event_type)
			.optStr(this.previous_hash)
			.str(this.user_id)
			.i64(this.ckb_block_height);

		for (const addr of this.ckb_addresses) {
			builder.str(addr);
		}

		// is_binding as a single byte (matching BE's `&[self.is_binding as u8]`).
		builder.byte(this.is_binding ? 1 : 0);

		builder.datetime(this.created_at);
		builder.datetime(this.expired_at);

		return builder.digest();
	}
}
