import { Button, Modal, Form, Input, Empty, Tooltip, Row, Col, Space } from "antd";
import { QuestionCircleOutlined, DoubleRightOutlined, SettingFilled } from "@ant-design/icons";
import React, { useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Explore, Authentication, AuthenticationRef, AccountSelect, FeeRateSelect } from "../../../components";
import { Dispatch, RootState } from "../../../store";
import { cx, formatError, download } from "../../../utils/methods";
import styles from "./RequestWithdraw.module.scss";
import QuantumPurse from "../../../../core/quantum_purse";
import { ccc, ClientBlockHeader, Hex } from "@ckb-ccc/core";
import { NERVOS_DAO } from "../../../../core/config";
import { parseEpoch, getProfit } from "../../../../core/epoch";
import { logger } from '../../../../core/logger';

const RequestWithdraw: React.FC = () => {
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
  const [depositEstimatedInfo, setDepositEstimatedInfo] = useState<{
    [key: string]: {
      tilMaxProfit: number;
      currentProfit: number;
      blockNum: bigint;
    };
  }>({});
  const [isRequestToMyAccount, setIsRequestToMyAccount] = useState(false);
  const [isCustomFee, setIsCustomFee] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authenticationRef = useRef<AuthenticationRef>(null);
  const { requestWithdraw: loadingRequest } = useSelector(
    (state: RootState) => state.loading.effects.wallet
  );

  const depositCells = daoCells.filter(cell => cell.outputData === "0x0000000000000000");
  const toError = form.getFieldError('to');
  const isToValid = values?.to && toError.length === 0;

  const quantumPurse = QuantumPurse.getInstance();

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

    const fetchRemainingDays = async () => {
      const estimatedInfos: { [key: string]: {tilMaxProfit: number, currentProfit: number, blockNum: bigint} } = {};
      for (const cell of depositCells) {
        const key = cell.outPoint.txHash + cell.outPoint.index;
        try {
          await quantumPurse.client.fetchTransaction(cell.outPoint.txHash);
          const depositTx = await quantumPurse.client.getTransaction(cell.outPoint.txHash);
          const depositHeader = await quantumPurse.client.getHeader(depositTx?.blockHash as Hex);
          if (!depositHeader) {
            throw new Error("Unable to retrieve DAO deposit block header at tx: " + cell.outPoint.txHash);
          }
          const remainingEpochs = Number(
            ccc.fixedPointToString(
              parseEpoch(tipHeader.epoch) - parseEpoch(depositHeader.epoch)
            )
          ) % 180;
          const tilMaxProfit = 30 - (remainingEpochs / 180) * 30;
          const currentProfit = Number(getProfit(cell, depositHeader, tipHeader));
          const blockNum = depositHeader.number;
          estimatedInfos[key] = {tilMaxProfit, currentProfit, blockNum};
        } catch (error) {
          logger("error", "Error calculating remaining days for cell: " + cell.outPoint.txHash + "/" + cell.outPoint.index + " Error: " + String(error));
          estimatedInfos[key] = {tilMaxProfit: Infinity, currentProfit: 0, blockNum: BigInt(0)};
        }
      }
      setDepositEstimatedInfo(estimatedInfos);
    };

    fetchRemainingDays();
  }, [daoCells, tipHeader, quantumPurse.hasClientStarted]);

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

  // todo update with `depositCell.getNervosDaoInfo` when light client js updates ccc core.
  const getNervosDaoInfo = async (depositCell: ccc.Cell):Promise<{depositHeader: ClientBlockHeader}> => {
    const depositTx = await quantumPurse.client.getTransaction(depositCell.outPoint.txHash);
    const blockHash = depositTx?.blockHash;
    const header = await quantumPurse.client.getHeader(blockHash as Hex);
    if (!header) {
      throw new Error("Unable to retrieve block header!");
    }
    return {depositHeader: header};
  };

  // Catch fee rate changes from FeeRateSelect component
  const handleFeeRateChange = (feeRate: number) => {
    setFeeRate(feeRate);
  };

  const handleWithdrawRequest = async (depositCell: ccc.Cell, signOffline: boolean) => {
    try {
      // todo update when light client js updates ccc core.
      const { depositHeader } = await getNervosDaoInfo(depositCell);
      const depositBlockNum = depositHeader.number;
      const depositBlockHash = depositHeader.hash;

      if (signOffline) {
        const tx = await dispatch.wallet.requestWithdraw({
          to: values.to,
          depositCell: depositCell,
          depositBlockNum: depositBlockNum,
          depositBlockHash: depositBlockHash,
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
        const txId = await dispatch.wallet.requestWithdraw({
          to: values.to,
          depositCell: depositCell,
          depositBlockNum: depositBlockNum,
          depositBlockHash: depositBlockHash,
          feeRate
        });
        Modal.success({
          title: 'Withdraw Request Successful',
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
        title: 'Withdraw Request Transaction Failed',
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
    <section className={cx(styles.withdrawRequestForm, "panel")}>
      <div>
        {(depositCells.length > 0 && Object.keys(depositEstimatedInfo).length !== 0) ? (
          <>
            <div>
              <Form layout="vertical" form={form}>
                <Row gutter={14}>
                  <Col xs={24} sm={14}>
                    <Form.Item
                      name="to"
                      label={
                        <div>
                          Request To
                          <Tooltip title="Be careful! Making a withdraw request to an address transfers the request's ownership too.">
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
                      className={cx("item-wrapper-with-label", isRequestToMyAccount && "select-my-account")}
                    >
                      {!isRequestToMyAccount ? (
                        <Space.Compact style={{ display: "flex" }}>
                          <Input
                            value={values?.to}
                            placeholder="Input the destination address"
                          />
                          <Button
                            onClick={() => {
                              setIsRequestToMyAccount(!isRequestToMyAccount);
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
                              setIsRequestToMyAccount(!isRequestToMyAccount);
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
                title="Make a withdraw request"
                afterClose={() => {
                  if (passwordResolver) {
                    passwordResolver.reject();
                    setPasswordResolver(null);
                  }
                }}
              />
            </div>

            <div className={styles.requestWithdrawListContainer}>
              <ul className={styles.requestWithdrawList}>
                {[...depositCells]
                  .sort((a, b) => {
                    const keyA = a.outPoint.txHash + a.outPoint.index;
                    const keyB = b.outPoint.txHash + b.outPoint.index;
                    const blockNumA = depositEstimatedInfo[keyA]?.blockNum ?? BigInt(0);
                    const blockNumB = depositEstimatedInfo[keyB]?.blockNum ?? BigInt(0);
                    return Number(blockNumB - blockNumA);
                  })
                  .map((cell) => {
                    const key = cell.outPoint.txHash + cell.outPoint.index;
                    const { tilMaxProfit, currentProfit } = depositEstimatedInfo[key] ?? { tilMaxProfit: Infinity, currentProfit: 0 };
                    const progress = Math.max(0, Math.min(1, (30 - tilMaxProfit) / 30));
                    return (
                      <li key={key} className={styles.depositItem}>
                        <div
                          className={styles.progressBackground}
                          style={{ width: `${progress * 100}%` }}
                        ></div>
                        <div className={styles.content}>
                          <span className={styles.capacity}>
                            <div>{(Number(BigInt(cell.cellOutput.capacity)) / 10**8).toFixed(2)} CKB</div>
                            <div>+ {Number((currentProfit / 10**8).toFixed(5))} CKB gained so far</div>
                            <div>Next locking cycle will start in {Number(tilMaxProfit.toFixed(1))} days</div>
                          </span>
                          <div
                            className={styles.buttonsContainer}
                          >
                            <Button
                              className={styles.buttons}
                              type="primary"
                              onClick={() => handleWithdrawRequest(cell, true)}
                              disabled={!isToValid || loadingRequest}
                            >
                              Sign & Export
                            </Button>
                            <Button
                              className={styles.buttons}
                              type="primary"
                              onClick={() => handleWithdrawRequest(cell, false)}
                              disabled={!isToValid || loadingRequest}
                            >
                              Request
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
          <div className={styles.requestWithdrawListContainer}>
            <Empty
              description={
                <span style={{ color: 'var(--gray-light)', fontFamily: 'Sora, sans-serif' }}>
                  No deposits found to make a request from! 🫠
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

export default RequestWithdraw;