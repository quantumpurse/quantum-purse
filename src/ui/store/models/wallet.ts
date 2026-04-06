import { createModel } from "@rematch/core";
import QuantumPurse from "../../../core/quantum_purse";
import { FIND_ACCOUNT_THRESHOLD, STORAGE_KEYS } from "../../utils/constants";
import { RootModel } from "./index";
import { Hex } from "@ckb-ccc/core";
import { DB } from "../../../core/db";

interface IAccount {
  name: string;
  address: string | null;
  spxLockArgs: string;
  scheme?: "sphincs+" | "mldsa65";
  balance?: string;
  lockedInDao?: string;
}

interface IWallet {
  active: boolean;
  initialized: boolean;
  current: IAccount;
  accounts: IAccount[];
  syncStatus: {
    nodeId: string;
    connections: number;
    syncedBlock: number;
    tipBlock: number;
    syncedStatus: number;
    startBlock: number;
  };
}

type StateType = IWallet;

let isInitializing = false;
export let quantum: QuantumPurse;
let syncStatusListener: ((status: any) => void) | null = null;

const initState: StateType = {
  active: false,
  initialized: false,
  current: {
    name: "",
    address: "",
    balance: "0",
    lockedInDao: "0",
    spxLockArgs: "",
  },
  accounts: [],
  syncStatus: {
    nodeId: "NULL",
    connections: 0,
    syncedBlock: 0,
    tipBlock: 0,
    syncedStatus: 0,
    startBlock: 0,
  },
};

export const wallet = createModel<RootModel>()({
  state: initState,
  reducers: {
    setSyncStatus(state: StateType, syncStatus: any) {
      return { ...state, syncStatus };
    },
    setActive(state: StateType, active: boolean) {
      return { ...state, active };
    },
    setCurrent(state: StateType, current: IAccount) {
      return { ...state, current };
    },
    setAccounts(state: StateType, accounts: IAccount[]) {
      return { ...state, accounts };
    },
    setAccountBalance(state: StateType, { spxLockArgs, balance }) {
      const accounts = state.accounts.map((account) => {
        if (account.spxLockArgs === spxLockArgs) {
          return { ...account, balance };
        }
        return account;
      });
      return { ...state, accounts };
    },
    setInitialized(state: StateType, initialized: boolean) {
      return { ...state, initialized };
    },
    reset() {
      return initState;
    },
  },
  effects: (dispatch) => ({
    async loadAccounts() {
      if (!quantum) return;
      try {
        const spxAccounts = await quantum.getAllLockScriptArgs();
        const mlDsaAccounts = await quantum.getAllMlDsaLockArgs();

        const spxData = spxAccounts.map((lockArgs, index) => ({
          name: `SPHINCS+ Account ${index + 1}`,
          spxLockArgs: lockArgs,
          address: quantum.getAddress(lockArgs as Hex, "sphincs+"),
          scheme: "sphincs+" as const,
        }));

        const mlDsaData = mlDsaAccounts.map((lockArgs, index) => ({
          name: `ML-DSA-65 Account ${index + 1}`,
          spxLockArgs: lockArgs,
          address: quantum.getAddress(lockArgs as Hex, "mldsa65"),
          scheme: "mldsa65" as const,
        }));

        const accountsData = [...spxData, ...mlDsaData];
        this.setAccounts(accountsData);
        return accountsData;
      } catch (error) {
        throw error;
      }
    },
    async init(_, rootState) {
      if (isInitializing) return;
      isInitializing = true;

      try {
        quantum = QuantumPurse.getInstance();
        await quantum.initBackgroundServices();
        // when refreshed, keyvault needs sphincs+ param set chosen by user
        const paramSet = await DB.getItem(STORAGE_KEYS.SPHINCS_PLUS_PARAM_SET);
        paramSet && quantum.initKeyVault(Number(paramSet));

        // Setup listener for the light client status worker
        syncStatusListener = (status) => {
          this.setSyncStatus(status);
        };
        quantum.addSyncStatusListener(syncStatusListener);

        // Get the pending step from local storage
        const step = await DB.getItem(STORAGE_KEYS.WALLET_STEP);
        if (step) {
          isInitializing = false;
          throw new Error(
            JSON.stringify({
              code: "WALLET_NOT_READY",
              step,
              message: "Wallet is not ready",
            })
          );
        }

        const accountsData: any = await this.loadAccounts();
        if (accountsData && accountsData.length !== 0) {
          const preservedAccountLockArgs = await DB.getItem(STORAGE_KEYS.CURRENT_ACCOUNT_POINTER);
  
          if (preservedAccountLockArgs) {
            await quantum.setAccountPointer(preservedAccountLockArgs);
          } else {
            await DB.setItem(STORAGE_KEYS.CURRENT_ACCOUNT_POINTER, accountsData[0].spxLockArgs);
            await quantum.setAccountPointer(accountsData[0].spxLockArgs);
          }
          this.setActive(true);
        } else {
          this.setActive(false);
        }
      } catch (error) {
        this.setActive(false);
        throw error;
      } finally {
        this.setInitialized(true);
        isInitializing = false;
      }
    },
    async loadCurrentAccount(_, rootState) {
      if (!quantum.accountPointer || !rootState.wallet.accounts.length) return;
      try {
        const accountPointer = quantum.accountPointer;
        const accountData = rootState.wallet.accounts.find(
          (account) => account.spxLockArgs === accountPointer
        );
        if (!accountData) return;
        const currentBalance = await quantum.getBalance();
        const lockInDAO = await quantum.getNervosDaoBalance();
        this.setCurrent({
          address: quantum.getAddress(accountPointer),
          balance: currentBalance.toString(),
          lockedInDao: lockInDAO.toString(),
          spxLockArgs: accountData.spxLockArgs,
          name: accountData.name,
        });
      } catch (error) {
        throw error;
      }
    },
    async createAccount(payload: { password: Uint8Array }, rootState) {
      try {
        await quantum.genAccount(payload.password);
        const accountsData: any = await this.loadAccounts();
        return accountsData?.at(-1);
      } finally {
        payload.password.fill(0);
      }
    },
    async createMlDsaAccount(payload: { password: Uint8Array }, rootState) {
      try {
        await quantum.genMlDsa65Account(payload.password);
        const accountsData: any = await this.loadAccounts();
        return accountsData?.at(-1);
      } finally {
        payload.password.fill(0);
      }
    },
    async createWallet({ password }) {
      let clonedPassword: Uint8Array = new Uint8Array(0);
      try {
        clonedPassword = password.slice();
        await quantum.generateMasterSeed(password);
        await quantum.genAccount(clonedPassword);
        this.loadCurrentAccount({});
      } finally {
        password.fill(0);
        clonedPassword.fill(0);
      }
    },
    async createWalletMlDsa({ password }) {
      let clonedPassword: Uint8Array = new Uint8Array(0);
      try {
        clonedPassword = password.slice();
        await quantum.generateMasterSeed(password);
        await quantum.genMlDsa65Account(clonedPassword);
        this.loadCurrentAccount({});
      } finally {
        password.fill(0);
        clonedPassword.fill(0);
      }
    },
    async getAccountBalance({ spxLockArgs }) {
      if (!quantum) return null;
      try {
        const balance = await quantum.getBalance(spxLockArgs);
        // this.setAccountBalance({
        //   spxLockArgs,
        //   balance: balance.toString(),
        // });
        return balance.toString();
      } catch (error) {
        return "0";
        // throw error;
      }
    },
    async switchAccount({ spxLockArgs, scheme }, rootState) {
      try {
        await quantum.setAccountPointer(spxLockArgs, scheme);
        this.loadCurrentAccount({});
        await DB.setItem(STORAGE_KEYS.CURRENT_ACCOUNT_POINTER, spxLockArgs);
      } catch (error) {
        throw error;
      }
    },
    async send({ to, amount, feeRate, signOffline }, rootState) {
      try {
        const txid = await quantum.transfer(to, amount, feeRate, signOffline);
        return txid;
      } catch (error) {
        throw error;
      }
    },
    async sendAll({ to, feeRate, signOffline }, rootState) {
      try {
        const txid = await quantum.transferAll(to, feeRate, signOffline);
        return txid;
      } catch (error) {
        throw error;
      }
    },
    async deposit({ to, amount, feeRate, signOffline }, rootState) {
      try {
        const txid = await quantum.daoDeposit(to, amount, feeRate, signOffline);
        return txid;
      } catch (error) {
        throw error;
      }
    },
    async depositAll({ to, feeRate, signOffline }, rootState) {
      try {
        const txid = await quantum.daoDepositAll(to, feeRate, signOffline);
        return txid;
      } catch (error) {
        throw error;
      }
    },
    async requestWithdraw({ to, depositCell, depositBlockNum, depositBlockHash, feeRate, signOffline }, rootState) {
      try {
        const txid = await quantum.daoRequestWithdraw(to, depositCell, depositBlockNum, depositBlockHash, feeRate, signOffline);
        return txid;
      } catch (error) {
        throw error;
      }
    },
    async withdraw({ to, withdrawCell, depositBlockHash, withdrawingBlockHash, feeRate, signOffline }, rootState) {
      try {
        const txid = await quantum.daoWithdraw(to, withdrawCell, depositBlockHash, withdrawingBlockHash, feeRate, signOffline);
        return txid;
      } catch (error) {
        throw error;
      }
    },
    async ejectWallet() {
      try {
        // remove light client sync status listener
        if (syncStatusListener) {
          quantum.removeSyncStatusListener(syncStatusListener);
          syncStatusListener = null;
        }
        await quantum.deleteWallet();
        await DB.removeItem(STORAGE_KEYS.CURRENT_ACCOUNT_POINTER);
        await DB.removeItem(STORAGE_KEYS.WALLET_STEP);
        this.reset();
      } catch (error) {
        throw error;
      }
    },
    async importWalletMlDsa({ srp, password }) {
      let clonedPassword: Uint8Array = new Uint8Array(password.length);
      let inloopClonePassword: Uint8Array = new Uint8Array(password.length);

      try {
        clonedPassword = password.slice();
        await quantum.importSeedPhrase(srp, password);

        let consecutiveEmpty = 0;
        let accountIndex = 0;
        let lastAccountWithBalance = -1;
        const batchSize = FIND_ACCOUNT_THRESHOLD;

        while (consecutiveEmpty < batchSize) {
          inloopClonePassword = clonedPassword.slice();
          const accounts = await quantum.genMlDsa65AccountInBatch(
            inloopClonePassword,
            accountIndex,
            batchSize
          );

          for (let i = 0; i < accounts.length; i++) {
            const lockArgs = accounts[i];
            const balance = await quantum.getMlDsaBalance(lockArgs as Hex);

            if (balance > BigInt(0)) {
              lastAccountWithBalance = accountIndex + i;
              consecutiveEmpty = 0;
            } else {
              consecutiveEmpty++;
              if (consecutiveEmpty >= batchSize) break;
            }
          }
          accountIndex += batchSize;
        }

        const accountsToRecover = lastAccountWithBalance >= 0 ? lastAccountWithBalance + 1 : 1;
        await quantum.recoverMlDsaAccounts(clonedPassword, accountsToRecover);
        this.setActive(true);
      } finally {
        srp.fill(0);
        password.fill(0);
        clonedPassword.fill(0);
        inloopClonePassword.fill(0);
      }
    },
    async importWallet({ srp, password }) {
      // each function call to key-vault clears the password bytes buffer,
      // so clone password for the sequential calls
      let clonedPassword: Uint8Array = new Uint8Array(password.length);
      let inloopClonePassword: Uint8Array = new Uint8Array(password.length);

      try {
        clonedPassword = password.slice();
        await quantum.importSeedPhrase(srp, password);

        let consecutiveEmpty = 0;
        let accountIndex = 0;
        let lastAccountWithBalance = -1;
        const batchSize = FIND_ACCOUNT_THRESHOLD;

        while (consecutiveEmpty < batchSize) {
          inloopClonePassword = clonedPassword.slice();
          const accounts = await quantum.genAccountInBatch(
            inloopClonePassword,
            accountIndex,
            batchSize
          );

          for (let i = 0; i < accounts.length; i++) {
            const spxLockArgs = accounts[i];
            const balance = await quantum.getBalance(spxLockArgs as Hex);

            if (balance > BigInt(0)) {
              lastAccountWithBalance = accountIndex + i;
              consecutiveEmpty = 0;
            } else {
              consecutiveEmpty++;
              if (consecutiveEmpty >= batchSize) {
                break;
              }
            }
          }

          accountIndex += batchSize;
        }

        const accountsToRecover = lastAccountWithBalance >= 0 ? lastAccountWithBalance + 1 : 1;
        await quantum.recoverAccounts(clonedPassword, accountsToRecover);

        this.setActive(true);
      } finally {
        // clean up always
        srp.fill(0);
        password.fill(0);
        clonedPassword.fill(0);
        inloopClonePassword.fill(0);
      }
    },
  }),
});