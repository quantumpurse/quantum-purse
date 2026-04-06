import { KeyOutlined, LoadingOutlined, LockOutlined, EyeInvisibleOutlined, EyeOutlined } from "@ant-design/icons";
import { Button, Checkbox, Flex, Form, Modal } from "antd";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { SrpTextBox } from "../../components";
import usePasswordValidator from "../../hooks/usePasswordValidator";
import { Dispatch, RootState } from "../../store";
import { STORAGE_KEYS, WALLET_STEP, WalletStepEnum, ROUTES } from "../../utils/constants";
import { cx, formatError } from "../../utils/methods";
import styles from "../CreateWallet/CreateWallet.module.scss";
import { CreateWalletContextType } from "../CreateWallet/interface";
import QuantumPurse, { SpxVariant } from "../../../core/quantum_purse";
import { DB } from "../../../core/db";
import { bytesToUtf8, utf8ToBytes } from "../../../core/utils";

// ML-DSA uses a fixed internal KeyVault variant (irrelevant to ML-DSA key derivation)
const MLDSA_KEYVAULT_DEFAULT = SpxVariant.Sha2128S;

interface ExtendedCreateWalletContextType extends CreateWalletContextType {
  srpRef: React.RefObject<Uint8Array | null>;
  srpRevealed: boolean;
  setSrpRevealed: (value: boolean) => void;
}

const CreateWalletMlDsaContext = createContext<ExtendedCreateWalletContextType>({
  currentStep: WALLET_STEP.PASSWORD,
  setCurrentStep: () => {},
  next: () => {},
  prev: () => {},
  done: () => {},
  steps: [],
  srpRef: { current: null },
  srpRevealed: false,
  setSrpRevealed: () => {},
});

const CreateWalletMlDsaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState<WalletStepEnum>(
    location.state?.step || WALLET_STEP.PASSWORD
  );
  const dispatch = useDispatch<Dispatch>();
  const { createWalletMlDsa: loadingCreateWallet } =
    useSelector((state: RootState) => state.loading.effects.wallet);

  const srpRef = useRef<Uint8Array | null>(null);
  const [srpRevealed, setSrpRevealed] = useState(false);

  const next = () => {
    const nextStepIndex = steps.findIndex((step) => step.key === currentStep) + 1;
    setCurrentStep(steps[nextStepIndex].key);
  };

  const prev = () => {
    const prevStepIndex = steps.findIndex((step) => step.key === currentStep) - 1;
    setCurrentStep(steps[prevStepIndex].key);
  };

  useEffect(() => {
    if (location.state?.step) setCurrentStep(location.state.step);
  }, [location.state?.step]);

  useEffect(() => {
    return () => {
      if (srpRef.current) {
        srpRef.current.fill(0);
        srpRef.current = null;
      }
    };
  }, []);

  const done = async () => {
    try {
      await DB.removeItem(STORAGE_KEYS.WALLET_STEP);
      await dispatch.wallet.init({});
      await dispatch.wallet.loadCurrentAccount({});
    } catch (error) {
      Modal.error({
        title: 'Wallet Initialization Failed',
        content: <div><p>{formatError(error)}</p></div>,
        centered: true,
        style: { transform: 'scale(0.9)' },
        transitionName: '',
        maskTransitionName: '',
      });
    } finally {
      if (srpRef.current) {
        srpRef.current.fill(0);
        srpRef.current = null;
      }
      setSrpRevealed(false);
    }
  };

  const steps = useMemo(() => [
    {
      key: WALLET_STEP.PASSWORD,
      title: "Password",
      description: "Create a password for your ML-DSA-65 wallet",
      icon: loadingCreateWallet ? <LoadingOutlined /> : <KeyOutlined />,
      content: <StepCreatePassword />,
    },
    {
      key: WALLET_STEP.SRP,
      title: "Secret Recovery Phrase",
      description: "Back up your mnemonic seed phrase",
      icon: <LockOutlined />,
      content: <StepSecureSRP />,
    },
  ], [loadingCreateWallet]);

  return (
    <CreateWalletMlDsaContext.Provider
      value={{ steps, currentStep, setCurrentStep, next, prev, done, srpRef, srpRevealed, setSrpRevealed }}
    >
      {children}
    </CreateWalletMlDsaContext.Provider>
  );
};

const StepCreatePassword: React.FC = () => {
  const [form] = Form.useForm();
  const { next, srpRef, setSrpRevealed } = useContext(CreateWalletMlDsaContext);
  const values = Form.useWatch([], form);
  const dispatch = useDispatch<Dispatch>();
  const [submittable, setSubmittable] = React.useState<boolean>(false);
  const { createWalletMlDsa: loadingCreateWallet } =
    useSelector((state: RootState) => state.loading.effects.wallet);
  const { rules: passwordRules } = usePasswordValidator(MLDSA_KEYVAULT_DEFAULT);
  const navigate = useNavigate();

  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string>('');
  const [passwordWarning, setPasswordWarning] = useState<string>('');
  const [confirmPasswordError, setConfirmPasswordError] = useState<string>('');
  const [passwordsValid, setPasswordsValid] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      if (passwordInputRef.current) passwordInputRef.current.value = '';
      if (confirmPasswordInputRef.current) confirmPasswordInputRef.current.value = '';
    };
  }, []);

  useEffect(() => {
    form
      .validateFields({ validateOnly: true })
      .then(() => setSubmittable(true))
      .catch(() => setSubmittable(false));
  }, [form, values]);

  const handlePasswordChange = async () => {
    if (!passwordInputRef.current) return;
    setPasswordError('');
    setPasswordWarning('');

    if (!passwordInputRef.current.value) {
      setPasswordsValid(false);
      return;
    }

    let hasError = false;
    for (const rule of passwordRules) {
      try {
        if (rule.validator) {
          await rule.validator({}, utf8ToBytes(passwordInputRef.current.value));
        }
      } catch (error: any) {
        if (rule.warningOnly) {
          setPasswordWarning(rule.message || error.message || '');
        } else {
          setPasswordError(error.message || String(error));
          hasError = true;
        }
        break;
      }
    }

    if (confirmPasswordInputRef.current?.value) {
      const passwordsMatch = passwordInputRef.current.value === confirmPasswordInputRef.current.value;
      if (!passwordsMatch) {
        setConfirmPasswordError('The passwords do not match!');
      } else {
        setConfirmPasswordError('');
      }
      setPasswordsValid(passwordsMatch && !hasError);
    } else {
      setPasswordsValid(false);
    }
  };

  const handleConfirmPasswordChange = () => {
    if (!passwordInputRef.current || !confirmPasswordInputRef.current) return;
    setConfirmPasswordError('');

    if (!confirmPasswordInputRef.current.value) {
      setPasswordsValid(false);
      return;
    }

    const passwordsMatch = passwordInputRef.current.value === confirmPasswordInputRef.current.value;
    if (!passwordsMatch) setConfirmPasswordError('The passwords do not match!');
    setPasswordsValid(passwordsMatch && !passwordError);
  };

  const onFinish = async (formValues: any) => {
    if (!passwordInputRef.current || !confirmPasswordInputRef.current) return;

    let passwordBytes: Uint8Array = new Uint8Array(0);
    let clonedPasswordBytes: Uint8Array = new Uint8Array(0);

    try {
      QuantumPurse.getInstance().initKeyVault(MLDSA_KEYVAULT_DEFAULT);
      await DB.setItem(STORAGE_KEYS.SPHINCS_PLUS_PARAM_SET, MLDSA_KEYVAULT_DEFAULT.toString());

      passwordBytes = utf8ToBytes(passwordInputRef.current.value);
      clonedPasswordBytes = passwordBytes.slice();

      passwordInputRef.current.value = '';
      confirmPasswordInputRef.current.value = '';

      await dispatch.wallet.createWalletMlDsa({ password: passwordBytes });
      srpRef.current = await QuantumPurse.getInstance().exportSeedPhrase(clonedPasswordBytes);
      setSrpRevealed(true);
      next();
      await DB.setItem(STORAGE_KEYS.WALLET_STEP, WALLET_STEP.SRP.toString());
    } catch (error) {
      Modal.error({
        title: 'Wallet Creation Failed',
        content: <div><p>{formatError(error)}</p></div>,
        centered: true,
        style: { transform: 'scale(0.9)' },
        transitionName: '',
        maskTransitionName: '',
      });
    } finally {
      passwordBytes.fill(0);
      clonedPasswordBytes.fill(0);
      if (passwordInputRef.current) passwordInputRef.current.value = '';
      if (confirmPasswordInputRef.current) confirmPasswordInputRef.current.value = '';
    }
  };

  return (
    <div className={styles.stepCreatePassword}>
      <h2>Password</h2>
      <p style={{ color: 'var(--gray-01)', marginBottom: '1.6rem', fontSize: '1.4rem' }}>
        ML-DSA-65 (FIPS 204) — Lattice-based post-quantum signatures, compact and fast.
      </p>
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{}}>
        <div style={{ marginBottom: '1.6rem' }}>
          <label style={{ color: 'var(--gray-01)', marginBottom: '0.8rem', display: 'block' }}>
            <span style={{ color: '#ff4d4f' }}>*</span> Password
          </label>
          <div className={styles.passwordWrapper}>
            <input
              ref={passwordInputRef}
              type={showPassword ? 'text' : 'password'}
              placeholder="Please choose a strong password"
              disabled={loadingCreateWallet}
              className={styles.passwordInput}
              onChange={handlePasswordChange}
            />
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => setShowPassword(!showPassword)}
              disabled={loadingCreateWallet}
              tabIndex={-1}
            >
              {showPassword ? <EyeOutlined /> : <EyeInvisibleOutlined />}
            </button>
          </div>
          {passwordError && <div style={{ color: '#ff4d4f', fontSize: '1.4rem', marginTop: '0.4rem' }}>{passwordError}</div>}
          {passwordWarning && <div style={{ color: '#faad14', fontSize: '1.4rem', marginTop: '0.4rem' }}>{passwordWarning}</div>}
        </div>

        <div style={{ marginBottom: '1.6rem' }}>
          <label style={{ color: 'var(--gray-01)', marginBottom: '0.8rem', display: 'block' }}>
            <span style={{ color: '#ff4d4f' }}>*</span> Confirm Password
          </label>
          <div className={styles.passwordWrapper}>
            <input
              ref={confirmPasswordInputRef}
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm your password"
              disabled={loadingCreateWallet}
              className={styles.passwordInput}
              onChange={handleConfirmPasswordChange}
            />
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={loadingCreateWallet}
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOutlined /> : <EyeInvisibleOutlined />}
            </button>
          </div>
          {confirmPasswordError && <div style={{ color: '#ff4d4f', fontSize: '1.4rem', marginTop: '0.4rem' }}>{confirmPasswordError}</div>}
        </div>

        <Form.Item
          name="walletTypeBackup"
          valuePropName="checked"
          rules={[{
            validator: (_, value) =>
              value ? Promise.resolve() : Promise.reject(new Error("You must agree to the terms!")),
          }]}
        >
          <Checkbox style={{ color: 'var(--gray-01)' }}>
            I understand I must back up my mnemonic phrase in the next step.
          </Checkbox>
        </Form.Item>

        <Form.Item
          name="passwordAwareness"
          valuePropName="checked"
          rules={[{
            validator: (_, value) =>
              value ? Promise.resolve() : Promise.reject(new Error("You must agree to the terms!")),
          }]}
        >
          <Checkbox style={{ color: 'var(--gray-01)' }}>
            I understand that Quantum Purse cannot recover this password if lost.
          </Checkbox>
        </Form.Item>

        <Flex align="center" justify="center" gap={16}>
          <Form.Item>
            <Button onClick={() => navigate(ROUTES.WELCOME)} disabled={loadingCreateWallet}>
              Back
            </Button>
          </Form.Item>
          <Form.Item>
            <Button
              htmlType="submit"
              type="primary"
              disabled={!submittable || !passwordsValid || loadingCreateWallet}
              loading={loadingCreateWallet}
              style={{ color: "var(--black)" }}
            >
              Create
            </Button>
          </Form.Item>
        </Flex>
      </Form>
    </div>
  );
};

const StepSecureSRP: React.FC = () => {
  const { done, srpRef, srpRevealed, setSrpRevealed } = useContext(CreateWalletMlDsaContext);

  const exportSrpHandler = async (password: Uint8Array) => {
    try {
      srpRef.current = await QuantumPurse.getInstance().exportSeedPhrase(password);
      setSrpRevealed(true);
    } finally {
      password.fill(0);
    }
  };

  return (
    <SrpTextBox
      value={srpRevealed && srpRef.current ? bytesToUtf8(srpRef.current) : ''}
      title={"Secure Secret Recovery Phrase"}
      description={
        srpRef.current
          ? "WARNING! Never copy or screenshot!\nOnly handwrite to backup your mnemonic phrase!\nThis wallet uses ML-DSA-65 — no variant to note, just the mnemonic."
          : "Your wallet creation process has been interrupted. Please enter your password to reveal your SRP then follow through the process or reset and start again."
      }
      exportSrpHandler={exportSrpHandler}
      onConfirm={done}
      isCreateWalletPage={true}
    />
  );
};

const CreateWalletMlDsaContent: React.FC = () => {
  const { steps, currentStep } = useContext(CreateWalletMlDsaContext);
  return (
    <section className={cx(styles.createWallet, "panel")}>
      <h1>Create An ML-DSA-65 Wallet</h1>
      <div>{steps.find((step) => step.key === currentStep)?.content}</div>
    </section>
  );
};

const CreateWalletMlDsa: React.FC = () => {
  return (
    <CreateWalletMlDsaProvider>
      <CreateWalletMlDsaContent />
    </CreateWalletMlDsaProvider>
  );
};

export default CreateWalletMlDsa;
