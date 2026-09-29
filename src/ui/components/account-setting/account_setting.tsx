import { useState, useMemo } from "react";
import { CopyOutlined } from "@ant-design/icons";
import Copy from "../copy/copy";
import { IAccount } from "../../store/models/interface";
import { shortenAddress } from "../../utils/methods";
import styles from "./account_setting.module.scss";
import { Button, Flex, Form, Input, Modal } from "antd";
import { useSelector } from "react-redux";
import { RootState } from "../../store";
import QuantumPurse from "../../../core/quantum_purse";
import { LightClientSetScriptsCommand } from "@nervosnetwork/ckb-light-client-js";
import { Hex } from "@ckb-ccc/core";
import { formatError } from "../../utils/methods";

interface AccountSettingProps {
  account: IAccount;
  onClose?: () => void;
}

const AccountSetting: React.FC<AccountSettingProps> = ({ account, onClose }) => {
  const syncStatus = useSelector((state: RootState) => state.wallet.syncStatus);
  const [startingBlock, setStartingBlock] = useState("");
  const [isSettingBlock, setIsSettingBlock] = useState(false);
  const tipBlock = syncStatus.tipBlock;
  const shortenedAddress = useMemo(
    () => shortenAddress(account.address!, 10, 20),
    [account.address]
  );

  const startBlockValidator = (): string | undefined => {
    if (startingBlock === "") return undefined;
    if (!/^\d+$/.test(startingBlock)) return "Please enter a valid number";
    if (Number(startingBlock) > tipBlock) return `Valid range is [0, ${tipBlock}]`;
    return undefined;
  };

  const validationResult = startBlockValidator();
  const isValidStartingBlock = (startingBlock !== "") && !validationResult;

  const handleSetStartingBlock = async () => {
    setIsSettingBlock(true);
    try {
      await QuantumPurse.getInstance().setSellectiveSyncFilter(
        [account.spxLockArgs as Hex],
        [BigInt(startingBlock)],
        LightClientSetScriptsCommand.Partial
      );
      setStartingBlock("");
      if (onClose) {
        onClose();
      }
      Modal.success({
        title: 'Starting Block Set Successfully',
        centered: true,
        style: { transform: 'scale(0.9)' },
        transitionName: '',
        maskTransitionName: '',
      });
    } catch (error) {
      Modal.error({
        title: 'Failed to Set Starting Block',
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
      setIsSettingBlock(false);
    }
  };

  return (
    <div className={styles.accountDetails}>
      <h2 className={styles.centeredHeading}>{account.name}</h2>
      <Copy value={account.address!}>
        <Flex align="center" gap={8} className={styles.address}>
          {shortenedAddress}
          <CopyOutlined />
        </Flex>
      </Copy>
      <div className={styles.startingBlock}>
        <Form.Item
          validateStatus={validationResult ? "error" : undefined}
          help={validationResult}
          style={{ marginBottom: 0 }}
        >
          <Flex align="center" gap={8}>
            <Input
              value={startingBlock}
              onChange={(e) => setStartingBlock(e.target.value)}
              placeholder={`Valid range: [0, ${syncStatus.tipBlock}]`}
              style={{ flex: 1, color: "var(--gray-03) !important" }}
            />
            <Button
              type="primary"
              onClick={handleSetStartingBlock}
              disabled={!isValidStartingBlock || isSettingBlock}
              loading={isSettingBlock}
            >
              Set Start Block
            </Button>
          </Flex>
        </Form.Item>
      </div>
    </div>
  );
};

export default AccountSetting;