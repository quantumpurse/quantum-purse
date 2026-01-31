import { useMemo } from "react";
import { CopyOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { cx, formatBalance, shortenAddress } from "../../utils/methods";
import Copy from "../copy/copy";
import styles from "./current_account.module.scss";
import { Tooltip } from "antd";

interface CurrentAccountProps extends React.HTMLAttributes<HTMLDivElement> {
  address: string;
  name: string;
  balance: string;
  lockedInDao?: string;
}

const CurrentAccount: React.FC<CurrentAccountProps> = ({
  address,
  name,
  balance,
  lockedInDao,
  className,
  ...props
}) => {
  const shortened = useMemo(
    () => shortenAddress(address, 6, 6),
    [address]
  );

  return (
    <div className={cx(styles.currentAccount, className)} {...props}>
      <p className="name">{name}</p>
      <div className="balance-container">
        <p className="balance">{formatBalance(balance)}</p>
        <Tooltip
          title={`An extra of ${formatBalance(lockedInDao)} is locked in the Nervos DAO`}
        >
          <QuestionCircleOutlined className="question-icon" />
        </Tooltip>
      </div>
      {address && (
        <Copy value={address} className="address-utilities">
          <p className="address">{shortened}</p>
          <CopyOutlined className="copy-icon" />
        </Copy>
      )}
    </div>
  );
};

export default CurrentAccount;