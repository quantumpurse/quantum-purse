import { Button, Modal, Form, Input, Empty, Tooltip, Row, Col, Space } from "antd";
import { QuestionCircleOutlined, DoubleRightOutlined, SettingFilled } from "@ant-design/icons";
import React, { useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AccountSelect, Explore, Authentication, AuthenticationRef, FeeRateSelect } from "../../../components";
import { Dispatch, RootState } from "../../../store";
import { cx, formatError, download } from "../../../utils/methods";
import styles from "./Withdraw.module.scss";
import QuantumPurse from "../../../../core/quantum_purse";
import { ccc, ClientBlockHeader, Hex } from "@ckb-ccc/core";
import { NERVOS_DAO } from "../../../../core/config";
import { parseEpoch, getClaimEpoch, getProfit } from "../../../../core/epoch";
import { logger } from '../../../../core/logger';

const Withdraw: React.FC = () => {
  const [form] = Form.useForm();
  const values = Form.useWatch([], form);
  const dispatch = useDispatch<Dispatch>();
  const wallet = useSelector((state: RootState) => state.wallet);
  const [daoCells, setDaoCells] = useState<ccc.Cell[]>([]);
  const [passwordResolver, setPasswordResolver] = useState<{
    resolve: (password: Uint8Array) => void;
    reject: () => void;
  } | null>(null);
  const [feeRate, setFeeRate] = useState<number | undefined>(undefined);
  const [tipHeader, setTipHeader] = useState<ClientBlockHeader | null>(null);
  const [redeemingInfos, setRedeemingInfos] = useState<{
    [key: string]: {
      remain: number; 
      profit: number;
      blockNum: bigint;
    };
  }>({});
  const [isWithdrawToMyAccount, setIsWithdrawToMyAccount] = useState(false);
  const [isCustomFee, setIsCustomFee] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authenticationRef = useRef<AuthenticationRef>(null);
  const { withdraw: loadingWithdraw } = useSelector(
    (state: RootState) => state.loading.effects.wallet
  );

  const withdrawRequestCells = daoCells.filter(cell => cell.outputData !== "0x0000000000000000");
  const isToValid = values?.to && form.getFieldError('to').length === 0;

  const quantumPurse = QuantumPurse.getInstance();

  useEffect(() => {
    if (!quantumPurse || !quantumPurse.accountPointer) {
      return;
    }

    (async () => {
      const daos = [];
      for await (const cell of quantumPurse.findCells(
        {
          script: {
            codeHash: NERVOS_DAO.codeHash,
            hashType: NERVOS_DAO.hashType,
            args: "0x"
          },
          scriptLenRange: [33, 34], // 32(codeHash) + 1 (hashType). No arguments.
          outputDataLenRange: [8, 9], // 8 bytes DAO data.
        },
        true,
      )) {
        daos.push(cell);
      }
      setDaoCells(daos);
    })();
  }, [quantumPurse, quantumPurse.accountPointer]);

  useEffect(() => {
    (async () => {
      if (quantumPurse && quantumPurse.hasClientStarted) {
        const header = await quantumPurse.client.getTipHeader();
        setTipHeader(header);
      }
    })();
  }, [quantumPurse, quantumPurse.hasClientStarted]);

  useEffect(() => {
    if (!tipHeader || daoCells.length === 0 || !quantumPurse.hasClientStarted) return;

    const fetchRedeemingInfo = async () => {
      const daysMap: { [key: string]: {remain: number, profit: number, blockNum: bigint} } = {};
      for (const cell of withdrawRequestCells) {
        const key = cell.outPoint.txHash + cell.outPoint.index;
        try {
          const { depositHeader, withdrawHeader } = await getNervosDaoInfo(cell);
          const remain = await calculateRemainingDays(depositHeader, withdrawHeader, tipHeader);
          const profit = Number(getProfit(cell, depositHeader, withdrawHeader));
          const blockNum = withdrawHeader.number;
          daysMap[key] = { remain, profit, blockNum };
        } catch (error) {
          logger("error", "Error calculating remaining days for cell: " + cell.outPoint.txHash + "/" + cell.outPoint.index + " Error: " + String(error));
          daysMap[key] = { remain: Infinity, profit: 0, blockNum: BigInt(0) }; // Error indicators
        }
      }
      setRedeemingInfos(daysMap);
    };

    fetchRedeemingInfo();
  }, [daoCells, tipHeader, quantumPurse.hasClientStarted]);

  // Set and clean up the requestPassword callback
  useEffect(() => {
    if (quantumPurse) {
      quantumPurse.requestPassword = (resolve, reject) => {
        setPasswordResolver({ resolve, reject });
        authenticationRef.current?.open();
      };
      // Cleanup when leaving send page
      return () => {
        quantumPurse.requestPassword = undefined;
      };
    }
  }, [quantumPurse]);

  const calculateRemainingDays = async(
    depositHeader: ClientBlockHeader,
    withdrawHeader: ClientBlockHeader,
    tipHeader: ClientBlockHeader,
  ): Promise<number> => {
    if (!tipHeader) return 0;
    const remainingCycles = Number(
      ccc.fixedPointToString(
        parseEpoch(getClaimEpoch(depositHeader, withdrawHeader)) -
          parseEpoch(tipHeader.epoch)
      )
    ) / 180;
      
    const remainingDays = (remainingCycles ?? 1) * 30;
    return remainingDays;
  };

  // todo update with `withdrawnCell.getNervosDaoInfo` when light client js updates ccc core.
  const getNervosDaoInfo = async (withdrawnCell: ccc.Cell):Promise<
    {
      depositHeader: ClientBlockHeader,
      withdrawHeader: ClientBlockHeader
    }
  > => {
    const withdrawTx = await quantumPurse.client.getTransaction(withdrawnCell.outPoint.txHash);
    const withdrawHeader = await quantumPurse.client.getHeader(withdrawTx?.blockHash as Hex);
    if (!withdrawHeader) {
      throw new Error("Unable to retrieve DAO withdrawing block header!");
    }

    const depositInput = withdrawTx?.transaction.inputs[Number(withdrawnCell.outPoint.index)];
    await quantumPurse.client.fetchTransaction(depositInput?.previousOutput.txHash as Hex);
    const depositTx = await quantumPurse.client.getTransaction(depositInput?.previousOutput.txHash as Hex);
    const depositHeader = await quantumPurse.client.getHeader(depositTx?.blockHash as Hex);
    if (!depositHeader) {
      throw new Error("Unable to retrieve DAO deposit block header!");
    }

    return { depositHeader, withdrawHeader };
  };

  // Catch fee rate changes from FeeRateSelect component
  const handleFeeRateChange = (feeRate: number) => {
    setFeeRate(feeRate);
  };

  const handleWithdraw = async (withdrawnCell: ccc.Cell,  signOffline: boolean) => {
    try {
      // todo update when light client js updates ccc core.
      const { depositHeader, withdrawHeader } = await getNervosDaoInfo(withdrawnCell);
      const depositBlockHash = depositHeader.hash;
      const withdrawingBlockHash = withdrawHeader.hash;

      if (signOffline) {
        const tx = await dispatch.wallet.withdraw({
          to: values.to,
          withdrawCell: withdrawnCell,
          depositBlockHash: depositBlockHash,
          withdrawingBlockHash: withdrawingBlockHash,
          feeRate,
          signOffline: true
        });

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
        const txId = await dispatch.wallet.withdraw({
          to: values.to,
          withdrawCell: withdrawnCell,
          depositBlockHash: depositBlockHash,
          withdrawingBlockHash: withdrawingBlockHash,
          feeRate
        });
        Modal.success({
          title: 'Withdraw Successful',
          content: (
            <div>
              <p>Your transaction has been successfully broadcast!</p>
              <p><Explore.Transaction txId={txId as string} /></p>
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
        title: 'Withdraw Transaction Failed',
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

  const authenCallback = async (password: Uint8Array) => {
    if (passwordResolver) {
      setIsAuthenticating(true);
      passwordResolver.resolve(password);
      setPasswordResolver(null);
    }
  };

  return (
    <section className={cx(styles.withdrawForm, "panel")}>
      <div>
        {(withdrawRequestCells.length > 0 && Object.keys(redeemingInfos).length !== 0) ? (
          <>
            <div>
              <Form layout="vertical" form={form}>
                <Row gutter={16}>
                  <Col xs={24} sm={14}>
                    <Form.Item
                      name="to"
                      label={
                        <div>
                          Withdraw To
                          <Tooltip title="Be careful! Withdrawing to an address transfers the deposit & reward to that address too.">
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
                              await ccc.Address.fromString(value, quantumPurse.client);
                              return Promise.resolve();
                            } catch (error) {
                              return Promise.reject("Invalid address");
                            }
                          },
                        },
                      ]}
                      className={cx("item-wrapper-with-label", isWithdrawToMyAccount && "select-my-account")}
                    >
                      {!isWithdrawToMyAccount ? (
                        <Space.Compact style={{ display: "flex" }}>
                          <Input
                            value={values?.to}
                            placeholder="Input the destination address"
                          />
                          <Button
                            onClick={() => {
                              setIsWithdrawToMyAccount(!isWithdrawToMyAccount);
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
                              setIsWithdrawToMyAccount(!isWithdrawToMyAccount);
                              form.setFieldsValue({ to: undefined }); 
                            }}
                            icon={<DoubleRightOutlined rotate={270} />}
                          />
                        </Space.Compact>
                      )}
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={10}>
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
                          <FeeRateSelect onFeeRateChange={handleFeeRateChange} custom={isCustomFee}/>
                        </div>
                        <Button 
                          onClick={() => setIsCustomFee(!isCustomFee)}
                          icon={<SettingFilled />}
                        />
                      </Space.Compact>
                      
                    </Form.Item>
                  </Col>
                </Row>
              </Form>

              <Authentication
                ref={authenticationRef}
                authenCallback={authenCallback}
                loading={isAuthenticating}
                title="Make a withdraw"
                afterClose={() => {
                  if (passwordResolver) {
                    passwordResolver.reject();
                    setPasswordResolver(null);
                  }
                }}
              />

            </div>

            <div className={styles.withdrawListContainer}>
              <ul className={styles.withdrawList}>
                {[...withdrawRequestCells]
                  .sort((a,b) => {
                    const keyA = a.outPoint.txHash + a.outPoint.index;
                    const keyB = b.outPoint.txHash + b.outPoint.index;
                    const blockNumA = redeemingInfos[keyA]?.blockNum ?? BigInt(0);
                    const blockNumB = redeemingInfos[keyB]?.blockNum ?? BigInt(0);
                    return Number(blockNumB - blockNumA);
                  })
                  .map((cell) => {
                    const key = cell.outPoint.txHash + cell.outPoint.index;
                    const {remain, profit} = redeemingInfos[key] ?? {remain: Infinity, profit: 0};
                    const progress = Math.max(0, Math.min(1, (30 - remain) / 30));
                    return (
                      <li key={key} className={styles.withdrawItem}>
                        <div
                          className={styles.progressBackground}
                          style={{ width: `${progress * 100}%` }}
                        ></div>
                        <div className={styles.content}>
                          <span className={styles.capacity}>
                            <div>{(Number(BigInt(cell.cellOutput.capacity)) / 10**8).toFixed(2)} CKB</div>
                            <div>+ {(profit/10**8).toFixed(5)} CKB </div>
                            <div>
                              {remain > 0 ? `Withdrawable in ${Number(remain.toFixed(1))} days` : <span style={{ color: 'var(--teal-2)' }}>Withdrawable now!</span>}
                            </div>
                          </span>
                          <div
                            className={styles.buttonsContainer}
                          >
                            <Button
                              className={styles.buttons}
                              type="primary"
                              onClick={() => handleWithdraw(cell, true)}
                              disabled={!isToValid || remain > 0 || loadingWithdraw}
                            >
                              Sign & Export
                            </Button>
                            <Button
                              className={styles.buttons}
                              type="primary"
                              onClick={() => handleWithdraw(cell, false)}
                              disabled={!isToValid || remain > 0 || loadingWithdraw}
                            >
                              Withdraw
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })
                }
              </ul>
            </div>
          </>
        ) : (
          <div className={styles.withdrawListContainer}>
            <Empty
              description={
                <span style={{ color: 'var(--gray-light)', fontFamily: 'Sora, sans-serif' }}>
                  No withdraw requests found! 🫠
                </span>
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              className={styles.emptyList}
            />
          </div>
        )}
      </div>
    </section>
  );
};

export default Withdraw;