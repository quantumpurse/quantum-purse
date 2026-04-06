import {
  Button,
  Divider,
  Empty,
  Flex,
  Input,
  Modal,
  Segmented,
  Spin,
} from "antd";
import React, { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Authentication,
  AuthenticationRef
} from "../../../components";
import { useAccountSearch } from "../../../hooks/useAccountSearch";
import { Dispatch, RootState } from "../../../store";
import { SigScheme } from "../../../store/models/interface";
import { cx, formatError } from "../../../utils/methods";
import styles from "./Accounts.module.scss";
import { AccountItem } from "../../../components/account-item/account_item";

const Accounts: React.FC = () => {
  const dispatch = useDispatch<Dispatch>();
  const wallet = useSelector((state: RootState) => state.wallet);
  const {
    createAccount: loadingCreateAccount,
    createMlDsaAccount: loadingCreateMlDsaAccount,
    loadAccounts: loadingLoadAccounts,
    switchAccount: loadingSwitchAccount,
  } = useSelector((state: RootState) => state.loading.effects.wallet);

  const { searchTerm, debouncedSearchTerm, filteredAccounts, handleSearch } =
    useAccountSearch(wallet.accounts);

  const authenticationRef = useRef<AuthenticationRef>(null);
  const [selectedScheme, setSelectedScheme] = useState<SigScheme>("sphincs+");

  const isCreating = loadingCreateAccount || loadingCreateMlDsaAccount;

  const createAccountHandler = async (password: Uint8Array) => {
    try {
      if (selectedScheme === "mldsa65") {
        await dispatch.wallet.createMlDsaAccount({ password });
      } else {
        await dispatch.wallet.createAccount({ password });
      }
    } catch (error) {
      Modal.error({
        title: 'Failed to Create Account',
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
      password.fill(0);
      authenticationRef.current?.close();
    }
  };

  const renderAccountList = () => {
    if (filteredAccounts.length === 0 && debouncedSearchTerm) {
      return (
        <Empty
          description={
            <span style={{ color: 'var(--gray-01)' }}>
              No accounts found matching your search
            </span>
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      );
    }

    return (
      <ul className="account-container">
        {filteredAccounts.map(({ address, name, spxLockArgs }, index) => (
          <React.Fragment key={spxLockArgs}>
            {index > 0 && (
              <Divider className="divider" key={`divider-${index}`} />
            )}
            <AccountItem
              key={spxLockArgs}
              address={address!}
              name={name}
              spxLockArgs={spxLockArgs}
              isLoading={loadingSwitchAccount}
            />
          </React.Fragment>
        ))}
      </ul>
    );
  };

  return (
    <section className={cx(styles.wallet, "panel")}>
      {/* <h1>Accounts</h1> */}

      <Flex
        justify="space-between"
        align="center"
        gap={8}
        style={{ marginBottom: 8, marginTop: 4 }}
      >
        <Input.Search
          placeholder="Search by name or address"
          onSearch={handleSearch}
          onChange={(e) => handleSearch(e.target.value)}
          allowClear
          style={{ width: "100%" }}
          value={searchTerm}
        />
        <Button
          type="primary"
          onClick={() => authenticationRef.current?.open()}
          loading={isCreating}
          disabled={isCreating || loadingLoadAccounts}
        >
          Gen New Account
        </Button>
      </Flex>
      <Flex justify="flex-end" style={{ marginBottom: 16 }}>
        <Segmented
          value={selectedScheme}
          onChange={(v) => setSelectedScheme(v as SigScheme)}
          options={[
            { label: "SPHINCS+", value: "sphincs+" },
            { label: "ML-DSA-65", value: "mldsa65" },
          ]}
          size="small"
        />
      </Flex>
      <div className={styles.accountListContainer}>
        <Spin size="large" spinning={loadingLoadAccounts}>
          {renderAccountList()}
        </Spin>
      </div>
      <Authentication
        title="Generate a new account"
        ref={authenticationRef}
        loading={loadingCreateAccount}
        authenCallback={createAccountHandler}
      />
    </section>
  );
};

export default Accounts;