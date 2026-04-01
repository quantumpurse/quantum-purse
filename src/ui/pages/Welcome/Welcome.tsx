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
      <p>Lightweight Client Wallet, Post-Quantum Hardened, Powered by CKB</p>
      <Button onClick={() => navigate(ROUTES.CREATE_WALLET, {replace: true})}>
        Create a New Wallet
      </Button>
      <Button onClick={() => navigate(ROUTES.IMPORT_WALLET, {replace: true})}>
        Import a Wallet Seed
      </Button>
    </section>
  );
};

export default Welcome;
