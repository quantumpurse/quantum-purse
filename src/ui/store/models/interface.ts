/** Signature scheme used by an account. Absent / undefined means "sphincs+" for backward compatibility. */
export type SigScheme = "sphincs+" | "mldsa65";

interface IAccount {
  name: string;
  address: string | null;
  /** Hex-encoded lock script args. 64 hex chars (32 B) for SPHINCS+; 72 hex chars (36 B) for ML-DSA-65. */
  spxLockArgs: string;
  /** Which post-quantum signature scheme this account uses. Defaults to "sphincs+" when absent. */
  sigScheme?: SigScheme;
}

interface CurrentAccount extends IAccount {
  balance: string;
}

interface IWallet {
  active: boolean;
  current: CurrentAccount;
  accounts: IAccount[];
}

export type { IAccount, IWallet };
