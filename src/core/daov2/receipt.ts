// Download a governance event receipt as a JSON file.
//
// A valid receipt MUST contain the server's ack of the append (Consensus
// rule 1): the checkpoint (leaf_index, mmr_root) and the attestation A_n
// signed over it. Without the ack the receipt is investigation-grade
// evidence only — it proves co-signing, not submission.
export interface AppendAck {
	git_commit_hash: string | null;
	leaf_index: number;
	mmr_root: string;
	attestation: string;
}

// When ack is null the BE response was lost (network failure after signing).
// The receipt then carries only the co-signed event — enough to open an
// investigation, not to convict.
export function downloadReceipt(
	activity: Record<string, unknown>,
	ack: AppendAck | null,
	filename: string,
) {
	// Mirror the archive record shape (README section 2.3) so a receipt can
	// be diffed against the auditor's line directly: the four keys match
	// ArchiveRecord, git_commit_hash trails as receipt-only extra. The
	// archived event will additionally carry `username`, added server-side.
	const receipt = ack
		? {
				event: activity,
				leaf_index: ack.leaf_index,
				mmr_root: ack.mmr_root,
				attestation: ack.attestation,
				git_commit_hash: ack.git_commit_hash,
			}
		: { event: activity };
	const blob = new Blob([JSON.stringify(receipt, null, "\t")], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
