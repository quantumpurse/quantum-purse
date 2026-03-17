import { Modal } from "antd";
import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Header } from "../components";
import { Dispatch, RootState } from "../store";
import { ROUTES } from "../utils/constants";
import { cx } from "../utils/methods";
import styles from "./Layout.module.scss";
import { logger } from '../../core/logger';
type AuthLayoutProps = React.HTMLAttributes<HTMLDivElement>;

const Layout: React.FC<AuthLayoutProps> = ({
  className,
  children,
  ...rest
}) => {
  const navigate = useNavigate();
  const dispatch = useDispatch<Dispatch>();
  const wallet = useSelector((state: RootState) => state.wallet);
  
  useEffect(() => {
    const loadWallet = async () => {
      try {
        await dispatch.wallet.init({});
        await dispatch.wallet.loadCurrentAccount({});
      } catch (error: any) {
        if (error.message && error.message.includes("SharedArrayBuffer is not defined")) {
          Modal.error({
            title: 'Insecure Browser Context',
            content: (
              <div>
                <p>You are accessing this site from an insecure context. Try localhost or https!</p>
              </div>
            ),
            centered: true,
            style: { transform: 'scale(0.9)' },
            transitionName: '',
            maskTransitionName: '',
          });
        } else if (error.message && error.message.includes("WALLET_NOT_READY")) {
          const errorInfo = JSON.parse(error.message);
          if (errorInfo.code === "WALLET_NOT_READY") {
            navigate(ROUTES.CREATE_WALLET, {
              state: {
                step: Number(errorInfo.step),
              },
            });
            Modal.info({
              title: 'Wallet Not Ready',
              content: (
                <div>
                  <p>Please finish the wallet creation process!</p>
                </div>
              ),
              centered: true,
              style: { transform: 'scale(0.9)' },
              transitionName: '',
              maskTransitionName: '',
            });
          }
        } else {
          // rethrow
          throw error;
        }
      }
    };
    loadWallet();
  }, [dispatch.wallet.init]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (wallet.active) {
      intervalId = setInterval(() => {
        dispatch.wallet.loadCurrentAccount({}).catch((error) => {
          logger("error", "Failed to load current account: " + String(error));
        });
      }, 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [dispatch, wallet.active]);

  return (
    <div className={cx(styles.layout, className)} {...rest}>
      {wallet.active && <Header />}
      <div className="container">{children}</div>
      {/* <Footer /> */}
      <div className="quantum-orb-3" />
      <div className="quantum-orb-4" />
      <div className="quantum-ring-1" />
      <div className="quantum-ring-2" />
      <div className="quantum-shimmer" />
    </div>
  );
};

export default Layout;
