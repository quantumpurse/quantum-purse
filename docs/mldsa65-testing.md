# ML-DSA-65 Testing Guide

This document covers how to build and test the ML-DSA-65 (FIPS 204) feature branch
(`feat/mldsa65`) before it is published to npm. The WASM binary is already compiled
into the bundle, so no Rust toolchain is required for basic testing.

---

## Quick Test — Deploy Pre-Built Bundle to Vercel

The `public/` folder contains a production webpack build with the ML-DSA-65 WASM
already compiled in. You can deploy it as a static site in under a minute:

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Clone this branch
git clone -b feat/mldsa65 https://github.com/toastmanAu/quantum-purse.git
cd quantum-purse

# Deploy the pre-built output — no rebuild required
vercel deploy public/ --name quantum-purse-mldsa-test
```

Vercel will give you a preview URL (e.g. `https://quantum-purse-mldsa-test-xxx.vercel.app`).
Open it in **Chrome, Brave, or Safari** — the light client requires SharedArrayBuffer,
which needs the COOP/COEP headers already set in `vercel.json`.

---

## What to Test

### 1. Wallet Setup

- [ ] Create a new wallet with a password
- [ ] Record the seed phrase shown during setup
- [ ] Confirm the wallet loads to the main screen

### 2. Create an ML-DSA-65 Account

- [ ] Navigate to **Accounts → New Account**
- [ ] Select **ML-DSA-65** as the signature scheme
- [ ] Confirm an address beginning with `ckt` (testnet) is generated
- [ ] Confirm the address is distinct from any SPHINCS+ address on the same wallet

### 3. SPHINCS+ Coexistence

- [ ] Create a second account using **SPHINCS+**
- [ ] Confirm both accounts appear in the account list
- [ ] Confirm each shows its correct scheme label
- [ ] Switch between accounts and verify addresses update correctly

### 4. Receive Funds (Testnet)

- [ ] Copy the ML-DSA-65 account address
- [ ] Request testnet CKB from the [Nervos faucet](https://faucet.nervos.org/)
  - Minimum 73 CKB required (quantum-resistant lock scripts need more capacity)
- [ ] Wait for the light client to sync (peer count and sync % shown in header)
- [ ] Confirm the balance appears on the ML-DSA-65 account

### 5. Send a Transaction

- [ ] Navigate to **Send** with the ML-DSA-65 account selected
- [ ] Enter a testnet destination address and an amount (≥ 73 CKB recommended)
- [ ] Enter your wallet password when prompted
- [ ] Confirm the transaction is broadcast and appears in the CKB testnet explorer
  - Explorer: https://testnet.explorer.nervos.org/

### 6. Wallet Recovery

- [ ] Delete the wallet (clear IndexedDB via browser DevTools → Application → Storage)
- [ ] Restore from the seed phrase recorded in step 1
- [ ] Confirm ML-DSA-65 accounts are recovered via **Recover Accounts**
  > **Note:** Light client sync speed affects batch recovery. If only the first
  > account appears, create additional accounts manually and use the context menu
  > to set the correct starting block from the explorer.

### 7. Cross-Scheme Send

- [ ] Send from a **SPHINCS+** account to the **ML-DSA-65** address
- [ ] Confirm receipt on the ML-DSA-65 account
- [ ] Send from **ML-DSA-65** back to the **SPHINCS+** address
- [ ] Confirm both transactions appear correctly in explorer

---

## Build From Source (Optional)

If you want to verify the full build rather than using the pre-built bundle:

### Prerequisites

```bash
# Rust + wasm toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Node
node >= 18, npm >= 9
```

### Build

```bash
# 1. Build the WASM key vault
git clone -b feat/mldsa65 https://github.com/toastmanAu/key-vault-wasm.git
cd key-vault-wasm
bash build.sh
cd ..

# 2. Build the web app pointing at the local WASM
git clone -b feat/mldsa65 https://github.com/toastmanAu/quantum-purse.git
cd quantum-purse
npm install ../key-vault-wasm/dist
npm run build:web

# 3. Deploy or serve locally
vercel deploy public/ --name quantum-purse-mldsa-test
# or: npx serve public/
```

---

## Known Limitations (This Branch)

| Limitation | Details |
|------------|---------|
| Mainnet lock script | ML-DSA-65 lock is testnet-only (`ckb-mldsa-lock`). Mainnet deployment pending review. |
| `key-vault-wasm` not on npm | Using local path dep. Will be published after review. |
| Deterministic signing | Uses `try_sign_with_seed([0u8;32])` — the hedging seed is fixed zeros. Acceptable for CKB (deterministic signing is standard practice); can be upgraded to OS randomness post-review. |
| Batch account recovery | Same light-client sync limitation as SPHINCS+ — only first account auto-recovers on slow sync. |

---

## Key Changes in This Branch

### `key-vault-wasm` (`feat/mldsa65`)

- New crate: `crates/ckb-fips204-utils` — ML-DSA-65 key derivation and signing
- `src/lib.rs` — `gen_new_ml_dsa_account`, `sign_ml_dsa`, `recover_ml_dsa_accounts`, `get_all_ml_dsa_lock_args`
- `src/db.rs` — `MlDsaAccount` record type, IndexedDB store `ml-dsa-accounts`
- Same master seed covers both SPHINCS+ and ML-DSA-65 via separate HKDF paths — **no new backup needed**

### `quantum-purse` (`feat/mldsa65`)

- `src/core/config.ts` — `MLDSA_LOCK` config, `SigScheme` type
- `src/core/quantum_purse.ts` — `genNewMlDsaAccount`, `recoverMlDsaAccounts`, scheme-aware `getAddress`
- `src/core/ccc-adapter/qp_signer.ts` — `QpMlDsaSigner` extending `CCC Signer`
- `src/ui/` — account type selector, ML-DSA badge, scheme-aware send flow

---

## Reporting Issues

Please comment on the PR with:
- Browser and OS
- Which test step failed
- Any console errors (F12 → Console)
