import {
  Button,
  Flex,
  Form,
  Input,
  Modal,
  Tooltip,
  Row,
  Col,
  Space
} from "antd";
import {
  QuestionCircleOutlined,
  DoubleRightOutlined,
  SettingFilled,
  FullscreenOutlined,
  FullscreenExitOutlined
} from "@ant-design/icons";
import { useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AccountSelect, Explore, Authentication, AuthenticationRef, FeeRateSelect } from "../../../components";
import { Dispatch, RootState } from "../../../store";
import { CKB_DECIMALS } from "../../../utils/constants";
import { cx, formatError, download } from "../../../utils/methods";
import styles from "./Deposit.module.scss";
import QuantumPurse from "../../../../core/quantum_purse";
import { Address, fixedPointFrom } from "@ckb-ccc/core";

const Deposit: React.FC = () => {
  const [form] = Form.useForm();
  const values = Form.useWatch([], form);
  const [submittable, setSubmittable] = useState(false);
  const dispatch = useDispatch<Dispatch>();
  const wallet = useSelector((state: RootState) => state.wallet);
  const { deposit: loadingDeposit } = useSelector(
    (state: RootState) => state.loading.effects.wallet
  );
  const [fromAccountBalance, setFromAccountBalance] = useState<string | null>(null);
  const [passwordResolver, setPasswordResolver] = useState<{
    resolve: (password: Uint8Array) => void;
    reject: () => void;
  } | null>(null);
  const [feeRate, setFeeRate] = useState<number | undefined>(undefined);
  const [isDepositToMyAccount, setIsDepositToMyAccount] = useState(false);
  const [isDepositMax, setIsDepositMax] = useState(false);
  const [isCustomFee, setIsCustomFee] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authenticationRef = useRef<AuthenticationRef>(null);

  const quantumPurse = QuantumPurse.getInstance();

  // Validate form fields to enable/disable the Deposit button
  useEffect(() => {
    form
      .validateFields({ validateOnly: true })
      .then(() => setSubmittable(true))
      .catch(() => setSubmittable(false));
  }, [form, values]);

  // Set and clean up the requestPassword callback
  useEffect(() => {
    if (quantumPurse) {
      quantumPurse.requestPassword = (resolve, reject) => {
        setPasswordResolver({ resolve, reject });
        authenticationRef.current?.open();
      };
      // Cleanup when leaving deposit page
      return () => {
        quantumPurse.requestPassword = undefined;
      };
    }
  }, [quantumPurse]);

  // Fetch the account balance
  useEffect(() => {
    if (!wallet.current?.spxLockArgs) return;

    const getBalance = async () => {
      const balance = await dispatch.wallet.getAccountBalance({
        spxLockArgs: wallet.current!.spxLockArgs,
      });
      setFromAccountBalance(balance);
    };

    getBalance();
  }, [wallet, dispatch]);

  // Pre-validate fields when balance updates
  useEffect(() => {
    if (fromAccountBalance !== null) {
      form.validateFields(["from"]);
      if (values?.amount) {
        form.validateFields(["amount"]);
      }
    }
  }, [fromAccountBalance, form]);

  // Fill amount when deposit max
  useEffect(() => {
    if (isDepositMax && fromAccountBalance) {
      const maxAmount = Number(fromAccountBalance) / CKB_DECIMALS;
      form.setFieldsValue({ amount: maxAmount });
    } else if (isDepositMax === false) {
      form.setFieldsValue({ amount: undefined });
    }
  }, [isDepositMax, fromAccountBalance]);

  // Catch fee rate changes from FeeRateSelect component
  const handleFeeRateChange = (feeRate: number) => {
    setFeeRate(feeRate);
  };

  const handleDeposit = async (signOffline: boolean) => {
    try {
      if (signOffline) {
        const tx = isDepositMax
          ? await dispatch.wallet.depositAll({ to: values.to, feeRate, signOffline: true })
          : await dispatch.wallet.deposit({ to: values.to, amount: values.amount, feeRate , signOffline: true });

        Modal.success({
          title: 'Signed Transaction Successfully',
          content: (
            <div>
              <p>You can now save the signed transaction file and broadcast it later using a CKB node or explorer.</p>
            </div>
          ),
          onOk: () => {
            download(tx);
          },
          centered: true,
          style: { transform: 'scale(0.9)' },
          transitionName: '',
          maskTransitionName: '',
        });

      } else {
        const txId = isDepositMax
          ? await dispatch.wallet.depositAll({to: values.to, feeRate})
          : await dispatch.wallet.deposit({to: values.to, amount: values.amount, feeRate});

        Modal.success({
          title: 'Deposit Successful',
          content: (
            <div>
              <p>Your transaction has been successfully broadcast!</p>
              <p>
                <Explore.Transaction txId={txId as string} />
              </p>
            </div>
          ),
          centered: true,
          style: { transform: 'scale(0.9)' },
          transitionName: '',
          maskTransitionName: '',
        });
      }
    } catch (error) {

      Modal.error({
        title: 'Deposit Transaction Failed',
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
      form.resetFields();
      setIsAuthenticating(false);
      authenticationRef.current?.close();
    }
  };

  // Handle password submission and pass it to QPsigner::signOnlyTransaction
  const authenCallback = async (password: Uint8Array) => {
    if (passwordResolver) {
      setIsAuthenticating(true);
      passwordResolver.resolve(password);
      setPasswordResolver(null);
    }
  };

  return (
    <section className={cx(styles.depositForm, "panel")}>
      <div>
        <Form layout="vertical" form={form}>
          <Form.Item
            name="to"
            className={cx("item-wrapper-with-label", values?.isDepositToMyAccount && "select-my-account")}
            label={
              <div>
                Deposit To
                <Tooltip title="Be careful! Depositing to an address transfers the deposit's ownership too.">
                  <QuestionCircleOutlined style={{ marginLeft: 4 }} />
                </Tooltip>
              </div>
            }
            rules={[
              { required: true, message: "" },
              {
                validator: async (_, value) => {
                  if (!value) return Promise.resolve();
                  try {
                    await Address.fromString(value, quantumPurse.client);
                    return Promise.resolve();
                  } catch {
                    return Promise.reject("Invalid address");
                  }
                },
              },
            ]}
          >
            {!isDepositToMyAccount ? (
              <Space.Compact style={{ display: "flex" }}>
                <Input
                  value={values?.to}
                  placeholder="Input the destination address"
                />
                <Button
                  onClick={() => {
                    setIsDepositToMyAccount(!isDepositToMyAccount);
                    form.setFieldsValue({ to: undefined });
                  }}
                  icon={<DoubleRightOutlined rotate={90} />}
                />
              </Space.Compact>
            ) : (
              <Space.Compact style={{ display: "flex" }}>
                <AccountSelect
                  accounts={wallet.accounts}
                  onAccountChange={(val) => form.setFieldsValue({ to: val })}
                />
                <Button
                  onClick={() => {
                    setIsDepositToMyAccount(!isDepositToMyAccount);
                    form.setFieldsValue({ to: undefined });
                  }}
                  icon={<DoubleRightOutlined rotate={270} />}
                />
              </Space.Compact>
            )}
          </Form.Item>

          <Row gutter={10}>
            <Col xs={24} sm={12}>
              <Form.Item
                className={cx("item-wrapper-with-label")}
                name="amount"
                label={
                  <div>
                    Amount
                  </div>
                }
                rules={[
                  { required: true, message: "" },
                  {
                    validator: (_, value) => {
                      if (
                        !isDepositMax &&
                        fromAccountBalance &&
                        value &&
                        BigInt(fromAccountBalance) < fixedPointFrom(value)
                      ) {
                        return Promise.reject("Insufficient balance");
                      }
                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <Space.Compact style={{ display: "flex" }}>
                  <Input
                    value={values?.amount}
                    placeholder="Enter deposit amount"
                    disabled={isDepositMax}
                  />
                  <Button
                    onClick={() => setIsDepositMax(!isDepositMax)}
                    icon={isDepositMax? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  />
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="feeRate"
                className="item-wrapper-with-label"
                label={
                  <div>
                    Fee Rate
                    <Tooltip title="By default fee rate is set at 1500 shannons/kB. Set a custom fee rate if needed.">
                      <QuestionCircleOutlined style={{ marginLeft: 4 }} />
                    </Tooltip>
                  </div>
                }
              >
                <Space.Compact style={{ display: "flex" }}>
                  <div style={{ flex: 1 }}>
                    <FeeRateSelect onFeeRateChange={handleFeeRateChange} custom={isCustomFee} />
                  </div>
                  <Button
                    onClick={() => setIsCustomFee(!isCustomFee)}
                    icon={<SettingFilled />}
                  />
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            className="item-wrapper-with-label"
            label={
              <div>
                Commands
                <Tooltip title="Sign & Export allows you to sign the transaction and save it as a file for later broadcasting. Deposit will sign and broadcast the transaction immediately.">
                  <QuestionCircleOutlined style={{ marginLeft: 4 }} />
                </Tooltip>
              </div>
            }
          >
            <Flex gap="0.5rem">
              <Button
                onClick={() => handleDeposit(true)}
                disabled={!submittable || loadingDeposit}
                className={styles.depositButton}
              >
                Sign & Export
              </Button>
              <Button
                onClick={() => handleDeposit(false)}
                disabled={!submittable || loadingDeposit}
                loading={loadingDeposit}
                className={styles.depositButton}
              >
                Deposit
              </Button>
            </Flex>
          </Form.Item>
        </Form>
        <Authentication
          ref={authenticationRef}
          authenCallback={authenCallback}
          loading={isAuthenticating}
          title="Make a deposit"
          afterClose={() => {
            if (passwordResolver) {
              passwordResolver.reject();
              setPasswordResolver(null);
            }
          }}
        />
      </div>
    </section>
  );
};

export default Deposit;
