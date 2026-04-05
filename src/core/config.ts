// MAIN_NET flag passed in npm build command.
export const IS_MAIN_NET: boolean = (process.env.MAIN_NET === "true");

// Quantum-resistant Lock Script contract
export const SPHINCSPLUS_LOCK = IS_MAIN_NET
  ? {
    codeHash:
      "0x302d35982f865ebcbedb9a9360e40530ed32adb8e10b42fbbe70d8312ff7cedf",
    hashType: "type",
    outPoint: {
      txHash:
        "0x4598d00df2f3dc8bc40eee38689a539c94f6cc3720b7a2a6746736daa60f500a",
      index: "0x0",
    },
    depType: "code",
  } : {
    codeHash:
      "0x147ecbb5c5127d982ee1362d2c2bb4267803da2eb006d150e88af6caaa0a7eaf",
    hashType: "data1",
    outPoint: {
      txHash:
        "0x631d9a6049fb1fc3790e89d9daf35abe535b5e754cd8c3404319319710f0b106",
      index: "0x0",
    },
    depType: "code",
  };

// ML-DSA-65 (FIPS 204) Lock Script contract
// Testnet type_id: deployed via ckb-mldsa-lock (github.com/toastmanAu/ckb-mldsa-lock)
// Mainnet: not yet deployed — use testnet config as placeholder until mainnet launch.
export const MLDSA_LOCK = IS_MAIN_NET
  ? {
    // TODO: replace with mainnet deployment once audited and deployed
    codeHash:
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    hashType: "type" as const,
    outPoint: {
      txHash:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      index: "0x0",
    },
    depType: "code" as const,
  } : {
    // type_id — stable across contract upgrades
    codeHash:
      "0x8984f4230ded4ac1f5efee2b67fef45fcda08bd6344c133a2f378e2f469d310d",
    hashType: "type" as const,
    outPoint: {
      txHash:
        "0xba4a6560ef719b24d170bf678611b25b799c56e6a80f18ce9c79e9561085cba7",
      index: "0x0",
    },
    depType: "code" as const,
  };

// Nervos DAO Type Script contract
export const NERVOS_DAO = IS_MAIN_NET
  ? {
    codeHash:
      "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
    hashType: "type",
    outPoint: {
      txHash:
        "0xe2fb199810d49a4d8beec56718ba2593b665db9d52299a0f9e6e75416d73ff5c",
      index: "0x2",
    },
    depType: "code",
  } : {
    codeHash:
      "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
    hashType: "type",
    outPoint: {
      txHash:
        "0x8f8c79eb6671709633fe6a46de93c0fedc9c1b8a6527a18d3983879542635c9f",
      index: "0x2",
    },
    depType: "code",
  };