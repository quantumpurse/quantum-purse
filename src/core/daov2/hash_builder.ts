/// Hash buffer builder — collects parts and computes SHA-256.
///
/// Mirrors the BE's pattern where each model's `compute_hash()` calls
/// `hasher.update()` with typed fields in a specific order. The builder
/// encapsulates encoding details (LE bytes, datetime format conversion)
/// so models only declare field order.

// ---------------------------------------------------------------------------
// Hex / SHA-256 utilities.
// ---------------------------------------------------------------------------

export function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function sha256(data: Uint8Array): Promise<string> {
	// Copy into a plain ArrayBuffer so TS 5.9 accepts it as BufferSource
	// (Uint8Array.buffer is ArrayBufferLike which includes SharedArrayBuffer).
	const buf = new ArrayBuffer(data.length);
	new Uint8Array(buf).set(data);
	const hash = await crypto.subtle.digest("SHA-256", buf);
	return bytesToHex(new Uint8Array(hash));
}

// ---------------------------------------------------------------------------
// HashBuilder.
// ---------------------------------------------------------------------------

export class HashBuilder {
	private parts: Uint8Array[] = [];
	private encoder = new TextEncoder();

	/** Append a UTF-8 string. */
	str(value: string): this {
		this.parts.push(this.encoder.encode(value));
		return this;
	}

	/** Append an optional string (empty string if null/undefined). */
	optStr(value: string | null | undefined): this {
		this.parts.push(this.encoder.encode(value ?? ""));
		return this;
	}

	/** Append a single byte. */
	byte(value: number): this {
		this.parts.push(new Uint8Array([value & 0xff]));
		return this;
	}

	/** Append an i64 as 8 little-endian bytes. */
	i64(value: number | null | undefined): this {
		const buf = new ArrayBuffer(8);
		new DataView(buf).setBigInt64(0, BigInt(value ?? 0), true);
		this.parts.push(new Uint8Array(buf));
		return this;
	}

	/** Append raw bytes as-is (e.g. a 32-byte hash decoded from hex). */
	bytes(value: Uint8Array): this {
		this.parts.push(value);
		return this;
	}

	/** Append an f64 as 8 little-endian bytes. */
	f64(value: number): this {
		const buf = new ArrayBuffer(8);
		new DataView(buf).setFloat64(0, value, true);
		this.parts.push(new Uint8Array(buf));
		return this;
	}

	/**
	 * Append a datetime string, converting to Chrono's NaiveDateTime Display
	 * format to match BE's compute_hash(). Handles both NaiveDateTime ("T"
	 * separator) and DateTime<Utc> ("Z" suffix) serde formats.
	 * Null/undefined → empty string (matching BE's unwrap_or_default).
	 */
	datetime(value: string | null | undefined): this {
		this.parts.push(this.encoder.encode(value ? value.replace("T", " ").replace("Z", "") : ""));
		return this;
	}

	/** Compute the final SHA-256 hex digest. */
	async digest(): Promise<string> {
		const totalLength = this.parts.reduce((sum, p) => sum + p.length, 0);
		const combined = new Uint8Array(totalLength);
		let offset = 0;
		for (const part of this.parts) {
			combined.set(part, offset);
			offset += part.length;
		}
		return sha256(combined);
	}
}
