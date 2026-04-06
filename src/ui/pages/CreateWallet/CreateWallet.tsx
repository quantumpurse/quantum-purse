import { KeyOutlined, LoadingOutlined, LockOutlined, EyeInvisibleOutlined, EyeOutlined } from "@ant-design/icons";
import { Button, Checkbox, Flex, Form, Modal, Select } from "antd";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import { SrpTextBox } from "../../components";
import usePasswordValidator from "../../hooks/usePasswordValidator";
import { Dispatch, RootState } from "../../store";
import {
  STORAGE_KEYS,
  WALLET_STEP,
  WalletStepEnum,
  ROUTES
} from "../../utils/constants";
import { cx, formatError } from "../../utils/methods";
import styles from "./CreateWallet.module.scss";
import { CreateWalletContextType } from "./interface";
import ParamSetSelectorForm from "../../components/sphincs-param-set/param_selector";
import QuantumPurse, { SpxVariant } from "../../../core/quantum_purse";
import { useNavigate } from "react-router-dom";
import { DB } from "../../../core/db";
import { bytesToUtf8, utf8ToBytes } from "../../../core/utils";

interface ExtendedCreateWalletContextType extends CreateWalletContextType {
  srpRef: React.RefObject<Uint8Array | null>;
  srpRevealed: boolean;
  setSrpRevealed: (value: boolean) => void;
}

const CreateWalletContext = createContext<ExtendedCreateWalletContextType>({
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

const CreateWalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState<WalletStepEnum>(
    location.state?.step || WALLET_STEP.PASSWORD
  );
  const dispatch = useDispatch<Dispatch>();
  const { createWallet: loadingCreateWallet } =
    useSelector((state: RootState) => state.loading.effects.wallet);
  
  const srpRef = useRef<Uint8Array | null>(null);
  const [srpRevealed, setSrpRevealed] = useState(false);

  const next = () => {
    const nextStepIndex =
      steps.findIndex((step) => step.key === currentStep) + 1;
    setCurrentStep(steps[nextStepIndex].key);
  };
  
  const prev = () => {
    const prevStepIndex =
      steps.findIndex((step) => step.key === currentStep) - 1;
    setCurrentStep(steps[prevStepIndex].key);
  };

  useEffect(() => {
    if (location.state?.step) {
      setCurrentStep(location.state.step);
    }
  }, [location.state?.step]);

  // Cleanup on unmount
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
        content: (
          <div>
            <p>{formatError(error)}</p>
          </div>
        ),
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

  const steps = useMemo(
    () => [
      {
        key: WALLET_STEP.PASSWORD,
        title: "Wallet Type & Password",
        description: "Choose a SPHINCS+ parameter set and create a password",
        icon: loadingCreateWallet ? <LoadingOutlined /> : <KeyOutlined />,
        content: <StepCreatePassword />,
      },
      {
        key: WALLET_STEP.SRP,
        title: "Secure Secret Recovery Phrase",
        description: "Back up your SPHINCS+ variant and Mnemonic Seed Phrase",
        icon: <LockOutlined />,
        content: <StepSecureSRP />,
      },
    ],
    [loadingCreateWallet]
  );

  return (
    <CreateWalletContext.Provider
      value={{
        steps,
        currentStep,
        setCurrentStep,
        next,
        prev,
        done,
        srpRef,
        srpRevealed,
        setSrpRevealed,
      }}
    >
      {children}
    </CreateWalletContext.Provider>
  );
};

const CreateWalletContent: React.FC = () => {
  const { steps, currentStep } = useContext(CreateWalletContext);

  return (
    <section className={cx(styles.createWallet, "panel")}>
      <h1>Create A New Wallet</h1>
      <div>{steps.find((step) => step.key === currentStep)?.content}</div>
    </section>
  );
};

export const StepCreatePassword: React.FC = () => {
  const [form] = Form.useForm();
  const { next, srpRef, setSrpRevealed } = useContext(CreateWalletContext);
  const values = Form.useWatch([], form);
  const dispatch = useDispatch<Dispatch>();
  const [submittable, setSubmittable] = React.useState<boolean>(false);
  const { createWallet: loadingCreateWallet } =
    useSelector((state: RootState) => state.loading.effects.wallet);
  const parameterSet = Form.useWatch('parameterSet', form);
  const { rules: passwordRules } = usePasswordValidator(parameterSet);
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
      if (passwordInputRef.current)
        passwordInputRef.current.value = '';
      if (confirmPasswordInputRef.current)
        confirmPasswordInputRef.current.value = '';
    };
  }, []);

  useEffect(() => {
    form
      .validateFields({ validateOnly: true })
      .then(() => setSubmittable(true))
      .catch(() => setSubmittable(false));
  }, [form, values]);

  useEffect(() => {
    handlePasswordChange();
  }, [parameterSet]);

  const handlePasswordChange = async () => {
    if (!passwordInputRef.current) return;

    setPasswordError('');
    setPasswordWarning('');

    if (!passwordInputRef.current.value) {
      setPasswordsValid(false);
      return;
    }

    let hasError = false;

    // Reusing password rules that were previously defined for Ant Form.item
    // but now plain html input
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

    if (!passwordsMatch) {
      setConfirmPasswordError('The passwords do not match!');
    }

    setPasswordsValid(passwordsMatch && !passwordError);
  };

  const onFinish = async (formValues: any) => {
    if (!passwordInputRef.current || !confirmPasswordInputRef.current) return;

    let passwordBytes: Uint8Array = new Uint8Array(0);
    let clonedPasswordBytes: Uint8Array = new Uint8Array(0);

    try {
      const parameterSet = formValues.parameterSet;

      const isMlDsa = parameterSet === "mldsa65";

      if (isMlDsa) {
        const spxVariant = formValues.spxVariant;
        QuantumPurse.getInstance().initKeyVault(spxVariant);
        await DB.setItem(STORAGE_KEYS.SPHINCS_PLUS_PARAM_SET, spxVariant.toString());
      } else if (parameterSet) {
        QuantumPurse.getInstance().initKeyVault(parameterSet);
        await DB.setItem(STORAGE_KEYS.SPHINCS_PLUS_PARAM_SET, parameterSet.toString());
      }

      passwordBytes = utf8ToBytes(passwordInputRef.current.value);
      clonedPasswordBytes = passwordBytes.slice();

      passwordInputRef.current.value = '';
      confirmPasswordInputRef.current.value = '';

      if (isMlDsa) {
        await dispatch.wallet.createWalletMlDsa({ password: passwordBytes });
      } else {
        await dispatch.wallet.createWallet({ password: passwordBytes });
      }
      srpRef.current = await QuantumPurse.getInstance().exportSeedPhrase(clonedPasswordBytes);
      setSrpRevealed(true);
      next();
      await DB.setItem(STORAGE_KEYS.WALLET_STEP, WALLET_STEP.SRP.toString());

    } catch (error) {
      Modal.error({
        title: 'Wallet Creation Failed',
        content: (
          <div>
            <p>{formatError(error)}</p>
          </div>
        ),
        centered: true,
        style: { transform: 'scale(0.9)' },
        transitionName: '',
        maskTransitionName: '',
      });
    } finally {
      passwordBytes.fill(0);
      clonedPasswordBytes.fill(0);
      if(passwordInputRef.current)
        passwordInputRef.current.value = '';
      if(confirmPasswordInputRef.current)
        confirmPasswordInputRef.current.value = '';
    }
  };

  return (
    <div className={styles.stepCreatePassword}>
      <h2>Wallet Type & Password</h2>
      <Form 
        form={form} 
        layout="vertical" 
        onFinish={onFinish}
        initialValues={{ parameterSet: SpxVariant.Sha2128S }}
      >
        
        <ParamSetSelectorForm />

        {parameterSet === "mldsa65" && (
          <Form.Item
            name="spxVariant"
            label={
              <span style={{ color: 'var(--gray-01)' }}>
                SPHINCS+ Variant (for key storage)
              </span>
            }
            rules={[{ required: true, message: "Please select a SPHINCS+ variant" }]}
            tooltip="ML-DSA uses the same master seed as SPHINCS+. Pick the variant your key vault will use — you'll need to note it alongside your mnemonic."
          >
            <Select size="large" placeholder="Select a SPHINCS+ variant">
              <Select.OptGroup label="128-bit | 36-word mnemonic">
                <Select.Option value={SpxVariant.Sha2128S}>SHA2_128s — recommended</Select.Option>
                <Select.Option value={SpxVariant.Sha2128F}>SHA2_128f</Select.Option>
                <Select.Option value={SpxVariant.Shake128S}>SHAKE_128s</Select.Option>
                <Select.Option value={SpxVariant.Shake128F}>SHAKE_128f</Select.Option>
              </Select.OptGroup>
              <Select.OptGroup label="192-bit | 54-word mnemonic">
                <Select.Option value={SpxVariant.Sha2192S}>SHA2_192s</Select.Option>
                <Select.Option value={SpxVariant.Sha2192F}>SHA2_192f</Select.Option>
                <Select.Option value={SpxVariant.Shake192S}>SHAKE_192s</Select.Option>
                <Select.Option value={SpxVariant.Shake192F}>SHAKE_192f</Select.Option>
              </Select.OptGroup>
              <Select.OptGroup label="256-bit | 72-word mnemonic">
                <Select.Option value={SpxVariant.Sha2256S}>SHA2_256s</Select.Option>
                <Select.Option value={SpxVariant.Sha2256F}>SHA2_256f</Select.Option>
                <Select.Option value={SpxVariant.Shake256S}>SHAKE_256s</Select.Option>
                <Select.Option value={SpxVariant.Shake256F}>SHAKE_256f</Select.Option>
              </Select.OptGroup>
            </Select>
          </Form.Item>
        )}

        <div style={{ marginBottom: '1.6rem' }}>
          <label
            style={{
              color: 'var(--gray-01)',
              marginBottom: '0.8rem',
              display: 'block',
            }}
          >
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
          <label
            style={{
              color: 'var(--gray-01)',
              marginBottom: '0.8rem',
              display: 'block',
            }}
          >
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
          rules={[
            {
              validator: (_, value) =>
                value
                  ? Promise.resolve()
                  : Promise.reject(new Error("You must agree to the terms!")),
            },
          ]}
        >
          <Checkbox style={{ color: 'var(--gray-01)' }}>
            I understand I must back up my wallet type with the mnemonic phrase next step.
          </Checkbox>
        </Form.Item>

        <Form.Item
          name="passwordAwareness"
          valuePropName="checked"
          rules={[
            {
              validator: (_, value) => {
                if (value) {
                  return Promise.resolve();
                }
                return Promise.reject(
                  new Error("You must agree to the terms!")
                );
              },
            },
          ]}
        >
          <Checkbox style={{ color: 'var(--gray-01)' }}>
            I understand that Quantum Purse cannot recover this password if lost.
          </Checkbox>
        </Form.Item>

        <Flex align="center" justify="center" gap={16}>
          <Form.Item>
            <Button
              onClick={() => navigate(ROUTES.WELCOME)}
              disabled={loadingCreateWallet}
            >
              Back
            </Button>
          </Form.Item>
          <Form.Item>
            <Button
              htmlType="submit"
              type="primary"
              disabled={!submittable || !passwordsValid || loadingCreateWallet}
              loading={loadingCreateWallet}
              style={{color: "var(--black)"}}
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
  const { done, srpRef, srpRevealed, setSrpRevealed } = useContext(CreateWalletContext);

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
          ? QuantumPurse.getInstance().getSphincsPlusParamSet()
            ? "WARNING! Never copy or screenshot!\nOnly handwrite to backup your mnemonic phrase! \n Backup too your chosen SPHINCS+ variant [" + SpxVariant[Number(QuantumPurse.getInstance().getSphincsPlusParamSet())] + "]!"
            : "WARNING! Never copy or screenshot!\nOnly handwrite to backup your mnemonic phrase!\nThis wallet uses ML-DSA-65 — no variant to note, just the mnemonic."
          : "Your wallet creation process has been interrupted. Please enter your password to reveal your SRP then follow through the process or reset and start again."
      }
      exportSrpHandler={exportSrpHandler}
      onConfirm={done}
      isCreateWalletPage={true}
    />
  );
};

const CreateWallet: React.FC = () => {
  return (
    <CreateWalletProvider>
      <CreateWalletContent />
    </CreateWalletProvider>
  );
};

export default CreateWallet;
