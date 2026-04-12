import { IS_MAIN_NET } from "../../core/config";

export const ROUTES = {
  HOME: "/",
  WELCOME: "/welcome",
  COMING_SOON: "/coming-soon",
  CREATE_WALLET: "/create-wallet",
  IMPORT_WALLET: "/import-wallet",
  SEND: "/send",
  RECEIVE: "/receive",
  NERVOS_DAO: {
    HOME: "/dao",
    DEPOSIT: "/dao/deposit",
    REQUEST_WITHDRAW: "/dao/request-withdraw",
    WITHDRAW: "/dao/withdraw",
  },
  SETTINGS: {
    HOME: "/settings",
    ACCOUNTS: "/settings/accounts",
    REVEAL_SRP: "/settings/reveal-srp",
    EJECT_WALLET: "/settings/eject-wallet",
  },
};

export const PASSWORD_ENTROPY_THRESHOLDS = {
  WEAK: 65,
  MEDIUM: 125,
  STRONG: 256,
  VERY_STRONG: 300,
};

export const CKB_DECIMALS = 10**8; // 1 CKB = 10^8 Shannons
export const CKB_UNIT = "CKB";
export const CKB_EXPLORER_URL = IS_MAIN_NET
  ? "https://explorer.nervos.org"
  : "https://testnet.explorer.nervos.org";

export const STORAGE_KEYS = {
  WALLET_STEP: "wallet-step",
  CURRENT_ACCOUNT_POINTER: "account-pointer",
  SPHINCS_PLUS_PARAM_SET: "spx-variant-id",
};

export const WALLET_STEP = {
  PASSWORD: 1,
  SRP: 2,
};
export const FIND_ACCOUNT_THRESHOLD = 5;

export type WalletStepEnum = (typeof WALLET_STEP)[keyof typeof WALLET_STEP];

export const REPOSITORY_URL =
  "https://github.com/tea2x/quantum-purse";
