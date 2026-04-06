import { KeyOutlined, LoadingOutlined, LockOutlined, EyeInvisibleOutlined, EyeOutlined } from "@ant-design/icons";
import { Button, Checkbox, Flex, Form, FormInstance, Modal, Tabs } from "antd";
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
import usePasswordValidator from "../../hooks/usePasswordValidator";
import { Dispatch, RootState } from "../../store";
import { WalletStepEnum, STORAGE_KEYS, ROUTES } from "../../utils/constants";
import { cx, formatError } from "../../utils/methods";
import styles from "../ImportWallet/ImportWallet.module.scss";
import QuantumPurse, { SpxVariant } from "../../../core/quantum_purse";
import { DB } from "../../../core/db";
import { utf8ToBytes } from "../../../core/utils";
import { IS_MAIN_NET } from "../../../core/config";

// ML-DSA uses a fixed internal KeyVault variant (irrelevant to ML-DSA key derivation)
const MLDSA_KEYVAULT_DEFAULT = SpxVariant.Sha2128S;

const STEP = {
  SRP: 1,
  PASSWORD: 2,
};

interface ImportMlDsaContext {
  currentStep?: WalletStepEnum;
  next: () => void;
  prev: () => void;
}

const ImportWalletMlDsaContext = createContext<ImportMlDsaContext>({
  currentStep: undefined,
  next: () => {},
  prev: () => {},
});

const ImportWalletMlDsaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState<WalletStepEnum>(
    location.state?.step || STEP.SRP
  );

  const next = () => setCurrentStep(currentStep + 1);
  const prev = () => setCurrentStep(currentStep - 1);

  useEffect(() => {
    if (location.state?.step) setCurrentStep(location.state.step);
  }, [location.state?.step]);

  return (
    <ImportWalletMlDsaContext.Provider value={{ currentStep, next, prev }}>
      {children}
    </ImportWalletMlDsaContext.Provider>
  );
};

interface BaseStepProps {
  form: FormInstance;
  passwordInputRef?: React.RefObject<HTMLInputElement | null>;
  confirmPasswordInputRef?: React.RefObject<HTMLInputElement | null>;
  srpInputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

const StepCreatePassword: React.FC<BaseStepProps> = ({ form, passwordInputRef, confirmPasswordInputRef }) => {
  const values = Form.useWatch([], form);
  const [submittable, setSubmittable] = React.useState<boolean>(false);
  const { importWalletMlDsa: loadingImport } =
    useSelector((state: RootState) => state.loading.effects.wallet);
  const { prev } = useContext(ImportWalletMlDsaContext);
  const { rules: passwordRules } = usePasswordValidator(MLDSA_KEYVAULT_DEFAULT);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string>('');
  const [passwordWarning, setPasswordWarning] = useState<string>('');
  const [confirmPasswordError, setConfirmPasswordError] = useState<string>('');
  const [passwordsValid, setPasswordsValid] = useState<boolean>(false);

  useEffect(() => {
    const validate = async () => {
      try {
        await form.validateFields({ validateOnly: true });
        setSubmittable(true);
      } catch (e: any) {
        setSubmittable(e.errorFields?.length === 0);
      }
    };
    validate();
  }, [form, values]);

  const handlePasswordChange = async () => {
    if (!passwordInputRef?.current) return;
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

    if (confirmPasswordInputRef?.current?.value) {
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
    if (!passwordInputRef?.current || !confirmPasswordInputRef?.current) return;
    setConfirmPasswordError('');

    if (!confirmPasswordInputRef.current.value) {
      setPasswordsValid(false);
      return;
    }

    const passwordsMatch = passwordInputRef.current.value === confirmPasswordInputRef.current.value;
    if (!passwordsMatch) setConfirmPasswordError('The passwords do not match!');
    setPasswordsValid(passwordsMatch && !passwordError);
  };

  return (
    <div className={styles.stepCreatePassword}>
      <h2>Password</h2>
      <p style={{ color: 'var(--gray-01)', marginBottom: '1.6rem', fontSize: '1.4rem' }}>
        ML-DSA-65 (FIPS 204) — Lattice-based post-quantum signatures, compact and fast.
      </p>

      <div style={{ marginBottom: '1.6rem' }}>
        <label style={{ color: 'var(--gray-01)', marginBottom: '0.8rem', display: 'block' }}>
          <span style={{ color: '#ff4d4f' }}>*</span> Password
        </label>
        <div className={styles.passwordWrapper}>
          <input
            ref={passwordInputRef}
            type={showPassword ? 'text' : 'password'}
            placeholder="Please choose a strong password"
            disabled={loadingImport}
            className={styles.passwordInput}
            onChange={handlePasswordChange}
          />
          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setShowPassword(!showPassword)}
            disabled={loadingImport}
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
            disabled={loadingImport}
            className={styles.passwordInput}
            onChange={handleConfirmPasswordChange}
          />
          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            disabled={loadingImport}
            tabIndex={-1}
          >
            {showConfirmPassword ? <EyeOutlined /> : <EyeInvisibleOutlined />}
          </button>
        </div>
        {confirmPasswordError && <div style={{ color: '#ff4d4f', fontSize: '1.4rem', marginTop: '0.4rem' }}>{confirmPasswordError}</div>}
      </div>

      <Form.Item
        name="passwordAwareness"
        valuePropName="checked"
        rules={[{
          validator: (_, value) =>
            value ? Promise.resolve() : Promise.reject(new Error("You must acknowledge this statement!")),
        }]}
      >
        <Checkbox style={{ color: "var(--gray-01)" }}>
          I understand that Quantum Purse cannot recover this password if lost.
        </Checkbox>
      </Form.Item>

      <Flex align="center" justify="center" gap={16}>
        <Form.Item>
          <Button onClick={() => prev()} disabled={loadingImport}>Back</Button>
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            onClick={() => form.submit()}
            disabled={!submittable || !passwordsValid || loadingImport}
            loading={loadingImport}
          >
            Import
          </Button>
        </Form.Item>
      </Flex>
    </div>
  );
};

const StepInputSrp: React.FC<BaseStepProps> = ({ form, srpInputRef }) => {
  const [submittable, setSubmittable] = React.useState<boolean>(false);
  const [srpError, setSrpError] = React.useState<string>('');
  const { next } = useContext(ImportWalletMlDsaContext);
  const navigate = useNavigate();

  const handleSrpChange = () => {
    if (!srpInputRef?.current) return;
    setSrpError('');

    if (!srpInputRef.current.value) {
      setSubmittable(false);
      return;
    }

    let wordCount = 0;
    let inWord = false;
    for (let i = 0; i < srpInputRef.current.value.length; i++) {
      const char = srpInputRef.current.value[i];
      const isSpace = char === ' ' || char === '\t' || char === '\n' || char === '\r';
      if (!isSpace && !inWord) {
        wordCount++;
        inWord = true;
      } else if (isSpace) {
        inWord = false;
      }
    }

    if (![36, 54, 72].includes(wordCount)) {
      setSrpError(`Current word count is ${wordCount} but expected to be 36, 54, or 72!`);
      setSubmittable(false);
      return;
    }

    setSubmittable(true);
  };

  return (
    <div className={styles.stepInputSrp}>
      <h2>Import Your Secret Recovery Phrase</h2>
      <div style={{ marginBottom: '1.6rem' }}>
        <textarea
          ref={srpInputRef}
          placeholder="Enter the mnemonic phrase"
          rows={9}
          className={styles.srpTextarea}
          onChange={handleSrpChange}
          onPaste={(e) => IS_MAIN_NET && e.preventDefault()}
        />
        {srpError && <div style={{ color: '#ff4d4f', fontSize: '1.4rem', marginTop: '0.4rem' }}>{srpError}</div>}
      </div>
      <Flex align="center" justify="center" gap={16}>
        <Form.Item>
          <Button onClick={() => navigate(ROUTES.WELCOME)}>Back</Button>
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            disabled={!submittable}
            onClick={() => next()}
          >
            Next
          </Button>
        </Form.Item>
      </Flex>
    </div>
  );
};

const ImportWalletMlDsaContent: React.FC = () => {
  const [form] = Form.useForm();
  const dispatch = useDispatch<Dispatch>();

  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);
  const srpInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return () => {
      if (srpInputRef.current) srpInputRef.current.value = '';
      if (passwordInputRef.current) passwordInputRef.current.value = '';
      if (confirmPasswordInputRef.current) confirmPasswordInputRef.current.value = '';
    };
  }, []);

  const onFinish = async (formValues: any) => {
    if (!passwordInputRef.current || !srpInputRef.current || !confirmPasswordInputRef.current) return;

    QuantumPurse.getInstance().initKeyVault(MLDSA_KEYVAULT_DEFAULT);
    await DB.setItem(STORAGE_KEYS.SPHINCS_PLUS_PARAM_SET, MLDSA_KEYVAULT_DEFAULT.toString());

    let srpBytes: Uint8Array = new Uint8Array(0);
    let passwordBytes: Uint8Array = new Uint8Array(0);
    try {
      srpBytes = utf8ToBytes(srpInputRef.current.value);
      passwordBytes = utf8ToBytes(passwordInputRef.current.value);

      await dispatch.wallet.importWalletMlDsa({ srp: srpBytes, password: passwordBytes });

      srpInputRef.current.value = '';
      passwordInputRef.current.value = '';
      confirmPasswordInputRef.current.value = '';

      await dispatch.wallet.init({});
      await dispatch.wallet.loadCurrentAccount({});
    } catch (error) {
      Modal.error({
        title: 'Import Wallet Failed',
        content: <div><p>{formatError(error)}</p></div>,
        centered: true,
        style: { transform: 'scale(0.9)' },
        transitionName: '',
        maskTransitionName: '',
      });
      return;
    } finally {
      srpBytes.fill(0);
      passwordBytes.fill(0);
    }
  };

  const { currentStep } = useContext(ImportWalletMlDsaContext);
  const { importWalletMlDsa: loadingImport } =
    useSelector((state: RootState) => state.loading.effects.wallet);

  const steps = useMemo(() => [
    {
      key: STEP.SRP,
      title: "Import SRP",
      icon: <LockOutlined />,
      content: <StepInputSrp form={form} srpInputRef={srpInputRef} />,
    },
    {
      key: STEP.PASSWORD,
      title: "Password",
      icon: loadingImport ? <LoadingOutlined /> : <KeyOutlined />,
      content: <StepCreatePassword form={form} passwordInputRef={passwordInputRef} confirmPasswordInputRef={confirmPasswordInputRef} />,
    },
  ], [loadingImport]);

  return (
    <section className={cx(styles.importWallet, "panel")}>
      <h1>Import An ML-DSA-65 Wallet</h1>
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Tabs
          items={steps.map((step) => ({
            key: step.key.toString(),
            label: step.title,
            children: step.content,
          }))}
          activeKey={currentStep?.toString()}
          renderTabBar={() => <></>}
          className={styles.tabs}
        />
      </Form>
    </section>
  );
};

const ImportWalletMlDsa: React.FC = () => {
  return (
    <ImportWalletMlDsaProvider>
      <ImportWalletMlDsaContent />
    </ImportWalletMlDsaProvider>
  );
};

export default ImportWalletMlDsa;
