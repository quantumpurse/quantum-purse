// qp_signer.ts
// A post-quantum CCC compatible signer supporting SPHINCS+ and ML-DSA-65.

import {
  Signer,
  SignerType,
  SignerSignType,
  Address,
  TransactionLike,
  Transaction,
  Signature,
  BytesLike,
  Script,
  hexFrom,
  bytesFrom,
  WitnessArgs,
  HashTypeLike
} from "@ckb-ccc/core";
import { QPClient } from "./qp_client";
import { IS_MAIN_NET, MLDSA_LOCK } from "../config";
import __wbg_init, { KeyVault, SpxVariant } from "quantum-purse-key-vault";
import { get_ckb_tx_message_all_hash } from "../utils";
import type { SigScheme } from "../../ui/store/models/interface";

/** Size of the MldsaWitness Molecule table placed in WitnessArgs.lock (bytes). */
const MLDSA65_WITNESS_LOCK_SIZE = 5305;

export class QPSigner extends Signer {
  public accountPointer?: BytesLike;
  /** Signature scheme of the currently active account. */
  public sigScheme: SigScheme = "sphincs+";
  protected spxLock: { codeHash: BytesLike; hashType: HashTypeLike };
  protected keyVault?: KeyVault;
  public requestPassword?: (
    resolve: (password: Uint8Array) => void,
    reject: () => void
  ) => void;

  constructor(spxLockInfo: { codeHash: BytesLike; hashType: HashTypeLike }) {
    super(new QPClient());
    this.spxLock = spxLockInfo;
  }

  override get client(): QPClient {
    return this.client_ as QPClient;
  }

  /**
   * Set the active account pointer, validating it exists in the DB.
   * Also sets `sigScheme` based on which store the lock args belong to.
   */
  async setAccountPointer(accPointer: BytesLike, scheme?: SigScheme) {
    if (scheme === "mldsa65") {
      const mldsaList = await KeyVault.get_all_ml_dsa_lock_args();
      if (!mldsaList.includes(accPointer as string))
        throw Error("Invalid ML-DSA-65 account pointer");
      this.sigScheme = "mldsa65";
    } else {
      const spxList = await this.getAllLockScriptArgs();
      if (!spxList.includes(accPointer as string))
        throw Error("Invalid SPHINCS+ account pointer");
      this.sigScheme = "sphincs+";
    }
    this.accountPointer = accPointer;
  }

  /**
   * Retrieve all SPHINCS+ lock script arguments from the indexed DB.
   * @returns An ordered array of all SPHINCS+ lock script args.
   */
  public async getAllLockScriptArgs(): Promise<string[]> {
    return await KeyVault.get_all_sphincs_lock_args();
  }

  /**
   * Retrieve all ML-DSA-65 lock script arguments from the indexed DB.
   * @returns An ordered array of all ML-DSA-65 lock script args.
   */
  public async getAllMlDsaLockArgs(): Promise<string[]> {
    return await KeyVault.get_all_ml_dsa_lock_args();
  }

  /**
   * Initialize the key-vault instance with a pre-determined SPHINCS+ variant.
   * @param variant The SPHINCS+ parameter set to start with
   */
  protected initKeyVaultCore(variant: SpxVariant) {
    if (this.keyVault) {
      this.keyVault.free();
    }
    this.keyVault = new KeyVault(variant);
  }

  /** Wasm-bindgen module init code for Key Vault */
  protected async initKeyVaultWBG(): Promise<void> {
    await __wbg_init();
  }

  /** Returns the active lock script config based on the current sig scheme. */
  protected get activeLock(): { codeHash: BytesLike; hashType: HashTypeLike } {
    return this.sigScheme === "mldsa65"
      ? { codeHash: MLDSA_LOCK.codeHash, hashType: MLDSA_LOCK.hashType }
      : this.spxLock;
  }

  /** CKB network */
  get type(): SignerType {
    return SignerType.CKB;
  }

  /** Signature type is post-quantum (SPHINCS+ or ML-DSA-65) */
  get signType(): SignerSignType {
    return SignerSignType.Unknown;
  }

  /** Connect (no-op — private key is authenticated per signing call) */
  async connect(): Promise<void> {
    return;
  }

  /** Check connection status */
  async isConnected(): Promise<boolean> {
    return false;
  }

  /** Get internal address using the active lock script */
  async getInternalAddress(): Promise<string> {
    const lock = Script.from({
      codeHash: this.activeLock.codeHash,
      hashType: this.activeLock.hashType,
      args: this.accountPointer as string,
    });
    return Address.fromScript(lock, this.client).toString();
  }

  /**
   * Get address objects for the active account.
   * Returns only the address for the current accountPointer.
   */
  async getAddressObjs(): Promise<Address[]> {
    return [
      {
        script: Script.from({
          codeHash: this.activeLock.codeHash,
          hashType: this.activeLock.hashType,
          args: this.accountPointer as string,
        }),
        prefix: IS_MAIN_NET ? "ckb" : "ckt",
      },
    ];
  }

  /** Verify message — not supported for post-quantum signers */
  async verifyMessage(
    _message: string | BytesLike,
    _signature: string | Signature
  ): Promise<boolean> {
    throw new Error("Unsupported method: verifyMessage");
  }

  /** Prepare transaction — reserves the correct witness placeholder size */
  async prepareTransaction(txLike: TransactionLike): Promise<Transaction> {
    if (!this.keyVault) throw new Error("KeyVault not initialized!");

    const tx = Transaction.from(txLike);
    const { script } = await this.getRecommendedAddressObj();

    let witnessLockSize: number;

    if (this.sigScheme === "mldsa65") {
      witnessLockSize = MLDSA65_WITNESS_LOCK_SIZE;
    } else {
      const spxSizeMap: Record<SpxVariant, number> = {
        [SpxVariant.Sha2128F]: 17125,
        [SpxVariant.Shake128F]: 17125,
        [SpxVariant.Sha2128S]: 7893,
        [SpxVariant.Shake128S]: 7893,
        [SpxVariant.Sha2192F]: 35717,
        [SpxVariant.Shake192F]: 35717,
        [SpxVariant.Sha2192S]: 16277,
        [SpxVariant.Shake192S]: 16277,
        [SpxVariant.Sha2256F]: 49925,
        [SpxVariant.Shake256F]: 49925,
        [SpxVariant.Sha2256S]: 29861,
        [SpxVariant.Shake256S]: 29861,
      };
      witnessLockSize = spxSizeMap[this.keyVault.variant] ?? 0;
    }

    await tx.prepareSighashAllWitness(script, witnessLockSize, this.client);
    return tx;
  }

  /** Sign only the transaction, routing to the correct scheme */
  async signOnlyTransaction(txLike: TransactionLike): Promise<Transaction> {
    let password: Uint8Array = new Uint8Array(0);
    try {
      if (!this.keyVault) throw new Error("KeyVault not initialized!");

      const tx = Transaction.from(txLike);

      const passwordHandler = new Promise<Uint8Array>((resolve, reject) => {
        if (this.requestPassword) {
          this.requestPassword(resolve, reject);
        } else {
          reject(new Error("Password request callback not available"));
        }
      });

      password = await passwordHandler;
      const position = 0;
      const witness = tx.getWitnessArgsAt(position) ?? WitnessArgs.from({});

      if (this.sigScheme === "mldsa65") {
        // ML-DSA-65: our lock script verifies blake2b("CKB-MLDSA-LOCK" || tx_hash).
        // Pass the raw tx_hash to WASM; it constructs the signing message internally.
        const txHashBytes = new Uint8Array(bytesFrom(tx.hash()));
        const mldsaWitness = await this.keyVault.sign_ml_dsa(
          password,
          this.accountPointer as string,
          txHashBytes
        );
        witness.lock = hexFrom(mldsaWitness);
      } else {
        // SPHINCS+: use the full CKB tx_message_all hash (RFC-0000)
        const message = get_ckb_tx_message_all_hash(tx);
        const spxSig = await this.keyVault.sign(
          password,
          this.accountPointer as string,
          message
        );
        witness.lock = hexFrom(spxSig);
      }

      tx.setWitnessArgsAt(position, witness);
      return tx;
    } catch (error: any) {
      throw new Error("Failed to sign transaction: " + error);
    } finally {
      password.fill(0);
    }
  }
}
