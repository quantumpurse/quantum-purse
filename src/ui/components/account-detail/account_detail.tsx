import { GlobalOutlined, CopyOutlined } from "@ant-design/icons";
import Icon from "../icon/icon";
import { Flex } from "antd";
import { QRCodeSVG } from "qrcode.react";
import { IAccount } from "../../store/models/interface";
import styles from "./account_detail.module.scss";
import { Explore, Copy } from "../../components";
import { message } from "antd";
import { IS_MAIN_NET } from "../../../core/config";

interface AccountDetailProps {
  account: IAccount;
}

const AccountDetail: React.FC<AccountDetailProps> = ({ account }) => {
  const claimCKB = async () => {
    if (!account?.address) {
      message.error("No active account address found!");
      return;
    }

    try {
      message.info("Requesting for 10000 test CKB ...");
      const res = await fetch("https://ckb-faucet-proxy.vercel.app/api/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          claim_event: {
            address_hash: account.address,
            amount: "10000",
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Proxy error ${res.status}`);
      }
      message.success("Success! Balance will update shortly.");
    } catch (err: any) {
      message.error(`Request failed: ${err.message}`);
    }
  };

  return (
    <div className={styles.detailContainer}>
      <div className={styles.iconContainer}>
        <Explore.Account address={account.address!}>
          <Flex align="center" gap={8} className={styles.extraInfo}>
            <GlobalOutlined />
          </Flex>
        </Explore.Account>

        <Copy value={account.address!}>
          <Flex align="center" gap={8} className={styles.extraInfo}>
            <CopyOutlined />
          </Flex>
        </Copy>

        {!IS_MAIN_NET && (
          <div
            onClick={async () => {
              await claimCKB();
            }}
          >
            <Flex align="center" gap={8} className={styles.extraInfo}>
              <Icon.Faucet />
            </Flex>
          </div>
        )}

      </div>
      <div className={styles.qrCodeContainer}>
        {account.address && (
          <QRCodeSVG
            value={account.address}
            size={150}
            level="H" // Highest error correction level
          />
        )}
      </div>
    </div>
  );
};

export default AccountDetail;