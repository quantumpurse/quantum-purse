import { Grid, Tooltip } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import React, { useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import LayoutCtx from "../../context/layout_ctx";
import { cx, shortenAddress, formatBalance } from "../../utils/methods";
import styles from "./header.module.scss";
import { useSelector } from "react-redux";
import { RootState } from "../../store";
import { Copy } from "../../components";
import { PieChart, Pie, Cell, Label } from "recharts";
import QuantumPurse from "../../../core/quantum_purse";

interface HeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

const Header: React.FC<HeaderProps> = ({ className, ...rest }) => {
  const isWalletActive = useSelector((state: RootState) => state.wallet.active);
  const syncStatus = useSelector((state: RootState) => state.wallet.syncStatus);
  const wallet = useSelector((state: RootState) => state.wallet);
  const { showSidebar, setShowSidebar } = useContext(LayoutCtx);
  const { useBreakpoint } = Grid;
  const MAX_OUT_BOUNDS = 4; // Maximum number of outbound connections in light client config.
  const [isUpdatingBalance, setIsUpdatingBalance] = useState(false);
  const [isUpdatingBlocks, setIsUpdatingBlockInfo] = useState(false);
  const [isUpdatingPeers, setIsUpdatingNodeInfo] = useState(false);

  const screens = useBreakpoint();
  const location = useLocation();
  const balance = wallet.current?.balance;
  const locked = wallet.current?.lockedInDao;
  const noBalance = (balance == "0" && locked == "0");
  const balanceData = noBalance
    ? [
        // Fake data for no balance, creating an "empty pie" effect.
        { name: "Available", value: 1 },
        { name: "Locked", value: 10**8 },
      ]
    : [
        { name: "Available", value: Number(balance) },
        { name: "Locked", value: Number(locked) },
      ];
  const syncData = [
    { name: "Synced", value: Number(Number(syncStatus?.syncedStatus).toFixed(2)) || 0 },
    { name: "Remaining", value: Number(Number(100 - (syncStatus?.syncedStatus || 0)).toFixed(2)) },
  ];
  const peersData = [
    { name: "Connected", value: Number(Number(syncStatus?.connections).toFixed(2)) || 0 },
    { name: "Waiting", value: Number(Number(MAX_OUT_BOUNDS - (syncStatus?.connections || 0)).toFixed(2)) },
  ];

  useEffect(() => {
    if ("md" in screens && !screens.md) {
      setShowSidebar(false);
    }
  }, [location.pathname, screens.md]);

  useEffect(() => {
    if (balance !== undefined && locked !== undefined) {
      setIsUpdatingBalance(true);
      const timer = setTimeout(() => setIsUpdatingBalance(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [balance, locked]);

  useEffect(() => {
    if (syncStatus) {
      setIsUpdatingBlockInfo(true);
      const timer = setTimeout(() => setIsUpdatingBlockInfo(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [syncStatus.syncedStatus]);

  useEffect(() => {
    if (syncStatus) {
      setIsUpdatingNodeInfo(true);
      const timer = setTimeout(() => setIsUpdatingNodeInfo(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [syncStatus.connections]);

  // Define scaling factor and dynamic sizes for mobile view.
  const scalingFactor = screens.md ? 1 : 0.8;
  const pieChartSize = 70 * scalingFactor;
  const innerRadius = 25 * scalingFactor;
  const outerRadius = 30 * scalingFactor;
  const fontSize = Math.round(12 * scalingFactor);
  const labelStyle = {
    fontSize: `${fontSize}px`,
    fontWeight: 'bold' as const,
  };

  return (
    <div>
      <header className={cx(styles.header, className)} {...rest}>
        {/* Balance gauge */}
        <div className={cx(styles.statusSection, styles.accentBalance, isUpdatingBalance && styles.updating)}>
          <Tooltip
            title={
              !screens.md ? (
                <>
                  {wallet.current.name}
                  <br />
                  Available: {formatBalance(balance as string)}
                  <br />
                  Deposited: {formatBalance(locked as string)}
                </>
              ) : (
                ""
              )
            }
          >
            <div>
              <PieChart width={pieChartSize} height={pieChartSize}>
                <Pie
                  data={balanceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={innerRadius}
                  outerRadius={outerRadius}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  animationDuration={500}
                  animationEasing="ease-in-out"
                  animationBegin={10}
                  stroke="none"
                >
                  <Cell fill="#00B27A" />
                  <Cell fill="rgba(255,255,255,0.06)" />
                  <Label
                    value="CKB"
                    position="center"
                    fill="var(--gray-01)"
                    style={labelStyle}
                  />
                </Pie>
              </PieChart>
            </div>
          </Tooltip>
          {screens.md && (
            <div className={styles.statusDetails}>
              <span className={styles.statusValue}>{wallet.current.name}</span>
              <span>Available: {formatBalance(balance as string)}</span>
              <span>Deposited: {formatBalance(locked as string)}</span>
            </div>
          )}
        </div>

        {/* Sync gauge */}
        <div className={cx(styles.statusSection, styles.accentSync, isUpdatingBlocks && styles.updating)}>
          <Tooltip
            title={
              !screens.md ? (
                <>
                  Tip: {syncStatus && syncStatus.tipBlock.toLocaleString()}
                  <br />
                  Synced: {syncStatus && syncStatus.syncedBlock.toLocaleString()}
                  <br />
                  Start: {syncStatus && syncStatus.startBlock.toLocaleString()}
                </>
              ) : (
                ""
              )
            }
          >
            <div>
              <PieChart width={pieChartSize} height={pieChartSize}>
                <Pie
                  data={syncData}
                  cx="50%"
                  cy="50%"
                  innerRadius={innerRadius}
                  outerRadius={outerRadius}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  animationDuration={2000}
                  animationEasing="ease-in-out"
                  animationBegin={20}
                  stroke="none"
                >
                  <Cell fill="#2196F3" />
                  <Cell fill="rgba(255,255,255,0.06)" />
                  <Label
                    value={`${syncStatus && syncStatus.syncedStatus.toFixed(0)}%`}
                    position="center"
                    fill="var(--gray-01)"
                    style={labelStyle}
                  />
                </Pie>
              </PieChart>
            </div>
          </Tooltip>
          {screens.md && (
            <div className={styles.statusDetails}>
              <span>Tip: {syncStatus && syncStatus.tipBlock.toLocaleString()}</span>
              <span>Synced: {syncStatus && syncStatus.syncedBlock.toLocaleString()}</span>
              <span>Start: {syncStatus && syncStatus.startBlock.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Peers gauge */}
        <div className={cx(styles.statusSection, styles.accentPeers, isUpdatingPeers && styles.updating)}>
          <Tooltip
            title={
              !screens.md ? (
                <>
                  <div>
                    Id: {" "}
                    {syncStatus.nodeId && syncStatus.nodeId !== "NULL" ? (
                      <Copy value={syncStatus.nodeId} style={{ display: 'inline-block' }}>
                        <span className={styles.copyable}>{shortenAddress(syncStatus.nodeId, 3, 5)}</span>
                      </Copy>
                    ) : (
                      <span>{syncStatus.nodeId}</span>
                    )}
                  </div>
                  Connected: {parseInt(syncStatus.connections.toString())} / {MAX_OUT_BOUNDS}
                </>
              ) : (
                ""
              )
            }
          >
            <div>
              <PieChart width={pieChartSize} height={pieChartSize}>
                <Pie
                  data={peersData}
                  cx="50%"
                  cy="50%"
                  innerRadius={innerRadius}
                  outerRadius={outerRadius}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  animationDuration={500}
                  animationEasing="ease-in-out"
                  animationBegin={20}
                  stroke="none"
                >
                  <Cell fill="#9C27B0" />
                  <Cell fill="rgba(255,255,255,0.06)" />
                  <Label
                    value="P2P"
                    position="center"
                    fill="var(--gray-01)"
                    style={labelStyle}
                  />
                </Pie>
              </PieChart>
            </div>
          </Tooltip>
          {screens.md && (
            <div className={styles.statusDetails}>
              <span className={styles.networkBadge}>
                {QuantumPurse.getInstance().client.addressPrefix === "ckb" ? "Meepo Mainnet" : "Meepo Testnet"}
              </span>

              <div>
                Id: {" "}
                {syncStatus.nodeId && syncStatus.nodeId !== "NULL" ? (
                  <Copy value={syncStatus.nodeId} style={{ display: 'inline-block' }}>
                    <span className={styles.copyable}>{shortenAddress(syncStatus.nodeId, 3, 5)}</span>
                  </Copy>
                ) : (
                  <span>{syncStatus.nodeId}</span>
                )}
              </div>

              {(syncStatus.connections != 0) ? (
                <span>Connected: {parseInt(syncStatus.connections.toString())} / {MAX_OUT_BOUNDS}</span>
              ) : (
                <span>Connecting .....</span>
              )}
            </div>
          )}
        </div>

        {!screens.md && isWalletActive && (
          <div
            className={styles.menuButton}
            onClick={() => setShowSidebar(!showSidebar)}
          >
            <MenuOutlined style={{ fontSize: "16px" }} />
          </div>
        )}
      </header>
    </div>
  );
};

export default Header;
