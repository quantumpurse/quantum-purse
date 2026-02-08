import { Menu, MenuProps, Grid } from "antd";
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ROUTES } from "../../utils/constants";
import { cx } from "../../utils/methods";
import styles from "./sidebar.module.scss";
import Icon from "../icon/icon";
import CurrentAccount from "../current-account/current_account";
import { useSelector } from "react-redux";
import { RootState } from "../../store";

type MenuItem = Required<MenuProps>["items"][number];
const items: MenuItem[] = [
  {
    key: ROUTES.RECEIVE,
    icon: <Icon.Receive />,
    label: <NavLink to={ROUTES.RECEIVE}>Receive</NavLink>,
  },
  {
    type: "divider",
  },
  {
    key: ROUTES.SEND,
    icon: <Icon.Send />,
    label: <NavLink to={ROUTES.SEND}>Send</NavLink>,
  },
  {
    type: "divider",
  },
  {
    key: ROUTES.NERVOS_DAO.HOME,
    icon: <Icon.Dao />,
    label: "Nervos DAO",
    children: [
      {
        key: ROUTES.NERVOS_DAO.DEPOSIT,
        icon: <Icon.Deposit />,
        label: <NavLink to={ROUTES.NERVOS_DAO.DEPOSIT}>Deposit</NavLink>,
      },
      {
        key: ROUTES.NERVOS_DAO.REQUEST_WITHDRAW,
        icon: <Icon.RequestWithdraw />,
        label: <NavLink to={ROUTES.NERVOS_DAO.REQUEST_WITHDRAW}>Request</NavLink>,
      },
      {
        key: ROUTES.NERVOS_DAO.WITHDRAW,
        icon: <Icon.Withdraw />,
        label: <NavLink to={ROUTES.NERVOS_DAO.WITHDRAW}>Withdraw</NavLink>,
      },
    ],
  },
  {
    type: "divider",
  },
  {
    key: ROUTES.SETTINGS.HOME,
    icon: <Icon.Settings />,
    label: "Settings",
    children: [
      {
        key: ROUTES.SETTINGS.ACCOUNTS,
        icon: <Icon.Wallet />,
        label: <NavLink to={ROUTES.SETTINGS.ACCOUNTS}>Accounts</NavLink>,
      },
      {
        key: ROUTES.SETTINGS.XXX,
        icon: <Icon.Dao />,
        label: <NavLink to={ROUTES.SETTINGS.XXX}>XXX</NavLink>,
      },
      {
        key: ROUTES.SETTINGS.REVEAL_SRP,
        icon: <Icon.Reveal />,
        label: <NavLink to={ROUTES.SETTINGS.REVEAL_SRP}>Reveal SRP</NavLink>,
      },
      {
        key: ROUTES.SETTINGS.EJECT_WALLET,
        icon: <Icon.Eject />,
        label: (
          <NavLink to={ROUTES.SETTINGS.EJECT_WALLET}>Eject Wallet</NavLink>
        ),
      },
    ],
  },
];

const getDefaultOpenKeys = (pathname: string, items: MenuItem[]): string[] => {
  for (const item of items) {
    if (
      item &&
      "key" in item &&
      typeof item.key === "string" &&
      "children" in item &&
      item.children
    ) {
      if (pathname.startsWith(item.key)) {
        return [item.key];
      }
    }
  }
  return [];
};

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {}
const Sidebar: React.FC<SidebarProps> = () => {
  const location = useLocation();
  const defaultOpenKeys = getDefaultOpenKeys(location.pathname, items);
  const wallet = useSelector((state: RootState) => state.wallet);
  const { useBreakpoint } = Grid;
  const screens = useBreakpoint();

  return (
    <nav className={cx(styles.sidebar)}>
      {!screens.md && (
        <CurrentAccount
          address={wallet.current.address!}
          name={wallet.current.name}
          balance={wallet.current.balance!}
          lockedInDao={wallet.current.lockedInDao}
        />
      )}
      <Menu
        mode="inline"
        items={items}
        defaultSelectedKeys={[location.pathname]}
        defaultOpenKeys={defaultOpenKeys}
      />
    </nav>
  );
};

export default Sidebar;