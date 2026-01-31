import {
  CopyOutlined,
  GlobalOutlined,
  MoreOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import {
  Button,
  Dropdown,
  Flex,
  Modal,
  Tag,
  Grid,
} from "antd";
import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  AccountSetting,
  Copy,
  Explore,
} from "../../components";
import { Dispatch, RootState } from "../../store";
import { cx, shortenAddress } from "../../utils/methods";
import styles from "./account_item.module.scss";
import { useLocation } from "react-router-dom";

const { useBreakpoint } = Grid;

interface AccountItemProps extends React.HTMLAttributes<HTMLLIElement> {
  address: string;
  name: string;
  spxLockArgs: string;
  hasTools?: boolean;
  copyable?: boolean;
  showBalance?: boolean;
  isLoading?: boolean;
}

export const AccountItem: React.FC<AccountItemProps> = ({
  address,
  name,
  spxLockArgs,
  hasTools = true,
  copyable = true,
  showBalance = false,
  isLoading = false,
  ...props
}) => {
  const screens = useBreakpoint();
  const dispatch = useDispatch<Dispatch>();
  const wallet = useSelector((state: RootState) => state.wallet);
  const isActive = spxLockArgs === wallet.current.spxLockArgs;
  const isWalletPage = useLocation().pathname === "/settings/accounts";
  const [isModalOpen, setIsModalOpen] = useState(false);
  const shortenedAddress = useMemo(
    () =>
      screens.md
        ? shortenAddress(address, 20, 45)
        : shortenAddress(address, 10, 25),
    [address, screens.md],
  );

  const menuOptions = useMemo(
    () => [
      {
        key: "view-details",
        label: (
          <p className="menu-item">
            <QrcodeOutlined />
            Sync Settings
          </p>
        ),
        onClick: () => setIsModalOpen(true),
      },
      {
        key: "explore",
        label: (
          <Explore.Account address={address} className="menu-item">
            <GlobalOutlined />
            Go To Explorer
          </Explore.Account>
        ),
      },
    ],
    [isActive, spxLockArgs, address, isLoading, dispatch]
  );

  return (
    <>
      <li {...props} className={cx(styles.accountItem)}>
        <div
          className="account-info"
          onClick={() => (!isActive && isWalletPage) && dispatch.wallet.switchAccount({ spxLockArgs })}
        >
          <p className="name">
            {name}{" "}
            {isActive && (
              <Tag color="var(--teal-2)" className="current">
                Current
              </Tag>
            )}
          </p>
          <span className="address">
            <span> {shortenedAddress} </span>
            {copyable && (
              <Copy value={address} className="copyable">
                <CopyOutlined />
              </Copy>
            )}
          </span>
        </div>
        <Flex gap={8} align="center">
          {hasTools && (
            <Dropdown
              rootClassName={styles.accountUtils}
              menu={{
                items: menuOptions,
              }}
            >
              <Button type="text" className="more-btn" disabled={isLoading}>
                <MoreOutlined />
              </Button>
            </Dropdown>
          )}
        </Flex>
      </li>
      <Modal
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        centered
        width={450}
      >
        <AccountSetting
          account={{ name, address, spxLockArgs }}
          onClose={() => setIsModalOpen(false)}
        />
      </Modal>
    </>
  );
};