// Download a governance activity receipt as a JSON file.
// The receipt includes the git commit hash for verification against the archive.
//todo: seems duplicated with the download function in quantum-purse/src/ui/utils/methods.ts.
export function downloadReceipt(
	activity: Record<string, unknown>,
	commitHash: string,
	filename: string,
) {
	const receipt = { git_commit: commitHash, ...activity };
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
