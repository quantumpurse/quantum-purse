import { Button, Spin } from "antd";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../utils/constants";
import styles from "./Welcome.module.scss";
import { useSelector } from "react-redux";
import { RootState } from "../../store";

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  const isWalletActive = useSelector((state: RootState) => state.wallet.active);
  const isInitialized = useSelector((state: RootState) => state.wallet.initialized);

  if (!isInitialized) {
    return (
      <section className={styles.welcome}>
        <Spin size="large" tip="Loading..." />
      </section>
    );
  }

  if (isWalletActive) {
    return (
      <section className={styles.welcome}>
        <Spin size="large" tip="Loading wallet..." />
      </section>
    );
  }

  return (
    <section className={styles.welcome}>
      <h1>Welcome to Quantum Purse</h1>
      <p>Lightweight Client Wallet, Post-Quantum Hardened, Powered by CKB.</p>

      <p style={{ marginTop: '1.6rem', marginBottom: '0.4rem', fontWeight: 600 }}>SPHINCS+ (FIPS 205)</p>
      <Button onClick={() => navigate(ROUTES.CREATE_WALLET, {replace: true})}>
        Create a New Wallet
      </Button>
      <Button onClick={() => navigate(ROUTES.IMPORT_WALLET, {replace: true})}>
        Import a Wallet Seed
      </Button>

      <p style={{ marginTop: '2rem', marginBottom: '0.4rem', fontWeight: 600 }}>ML-DSA-65 (FIPS 204)</p>
      <Button onClick={() => navigate(ROUTES.CREATE_WALLET_MLDSA, {replace: true})}>
        Create an ML-DSA-65 Wallet
      </Button>
      <Button onClick={() => navigate(ROUTES.IMPORT_WALLET_MLDSA, {replace: true})}>
        Import an ML-DSA-65 Wallet
      </Button>
    </section>
  );
};

export default Welcome;
