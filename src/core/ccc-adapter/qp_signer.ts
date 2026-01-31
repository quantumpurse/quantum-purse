// qp_signer.ts
// A sphincs+_based CCC compatible signer

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
  WitnessArgs,
  HashTypeLike,
  ClientPublicMainnet,
  ClientPublicTestnet
} from "@ckb-ccc/core";
import { QPClient } from "./qp_client";
import { IS_MAIN_NET } from "../config";
import __wbg_init, { KeyVault, SpxVariant } from "quantum-purse-key-vault";
import { get_ckb_tx_message_all_hash } from "../utils";

export class QPSigner extends Signer {
  public accountPointer?: BytesLike;
  protected spxLock: { codeHash: BytesLike, hashType: HashTypeLike };
  protected keyVault?: KeyVault;
  protected rpcNode?: ClientPublicMainnet | ClientPublicTestnet;
  public requestPassword?: (
    resolve: (password: Uint8Array) => void,
    reject: () => void
  ) => void;

  constructor(spxLockInfo: { codeHash: BytesLike, hashType: HashTypeLike }) {
    super(new QPClient());
    this.rpcNode = IS_MAIN_NET ? new ClientPublicMainnet() : new ClientPublicTestnet();
    this.spxLock = spxLockInfo;
  }

  override get client(): QPClient {
    return this.client_ as QPClient;
  }

  async setAccountPointer(accPointer: BytesLike) {
    const lockArgsList = await this.getAllLockScriptArgs();
    if (!lockArgsList.includes(accPointer as string)) throw Error("Invalid account pointer");
    this.accountPointer = accPointer;
  }

  /**
   * Retrieve all sphincs+ lock script arguments from all child accounts in the indexed DB.
   * @returns An ordered array of all child key's sphincs+ lock script argument.
   */
  public async getAllLockScriptArgs(): Promise<string[]> {
    return await KeyVault.get_all_sphincs_lock_args();
  }

  /**
   * Initialize the key-vault instance from within Signer with a pre-determined SPHINCS variant.
   * @param variant The SPHINCS+ parameter set to start with
   * @returns void.
   */
  protected initKeyVaultCore(variant: SpxVariant) {
    if (this.keyVault) {
      this.keyVault.free();
    }
    this.keyVault = new KeyVault(variant);
  }

  /* Wasm-bindgen module init code for Key Vault */
  protected async initKeyVaultWBG(): Promise<void> {
    await __wbg_init();
  }

  /** CKB network */
  get type(): SignerType {
    return SignerType.CKB;
  }

  /** Signature type is SPHINCS+ */
  get signType(): SignerSignType {
    return SignerSignType.Unknown;
  }

  /** Connect (no-op since private key must be authenticated via password each use) */
  async connect(): Promise<void> {
    return;
  }

  /** Check connection status */
  async isConnected(): Promise<boolean> {
    return false; // never connected
  }

  /** Get internal address */
  async getInternalAddress(): Promise<string> {
    const lock = Script.from({
      codeHash: this.spxLock.codeHash,
      hashType: this.spxLock.hashType,
      args: this.accountPointer as string
    });
    return Address.fromScript(lock, this.client).toString();
  }

  /** Get address objects 
   * Due to the current design of Quantum Purse, this function will only return 
   * the address object matching this.accountPointer, not all the address objects.
   */
  async getAddressObjs(): Promise<Address[]> {
    return [
      {
        script: Script.from({
          codeHash: this.spxLock.codeHash,
          hashType: this.spxLock.hashType,
          args: this.accountPointer as string
        }),
        prefix: IS_MAIN_NET ? "ckb" : "ckt"
      }
    ];
  }

  /** Verify message */
  async verifyMessage(message: string | BytesLike, signature: string | Signature): Promise<boolean> {
    throw new Error("Unsupported method: verifyMessage");
  }

  /** Prepare transaction */
  async prepareTransaction(txLike: TransactionLike): Promise<Transaction> {
    if (!this.keyVault) throw new Error("KeyVault not initialized!");

    const tx = Transaction.from(txLike);
    const { script } = await this.getRecommendedAddressObj();
    const witnessLockSizeMap = {
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
    const variant = this.keyVault.variant;
    const witnessLockSize = witnessLockSizeMap[variant] || 0;
    await tx.prepareSighashAllWitness(script, witnessLockSize, this.client);
    return tx;
  }

  /** Sign only the transaction */
  async signOnlyTransaction(txLike: TransactionLike): Promise<Transaction> {
    let password: Uint8Array = new Uint8Array(0);
    try {
      if (!this.keyVault) throw new Error("KeyVault not initialized!");

      const tx = Transaction.from(txLike);
      const message = get_ckb_tx_message_all_hash(tx); // TODO: Update when new CCC core support is released

      const passwordHandler = new Promise<Uint8Array>((resolve, reject) => {
        if (this.requestPassword) {
          this.requestPassword(resolve, reject);
        } else {
          reject(new Error("Password request callback not available"));
        }
      });

      password = await passwordHandler;
      const spxSig = await this.keyVault.sign(password, this.accountPointer as string, message);
      const position = 0;
      const witness = tx.getWitnessArgsAt(position) ?? WitnessArgs.from({});
      witness.lock = hexFrom(spxSig);
      tx.setWitnessArgsAt(position, witness);
      return tx;
    } catch (error: any) {
      throw new Error("Failed to sign transaction: " + error);
    } finally {
      password.fill(0);
    }
  }
}