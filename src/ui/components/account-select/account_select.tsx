import { Select, SelectProps, Grid } from "antd";
import type { DefaultOptionType } from "antd/es/select";
import { useAccountSearch } from "../../hooks/useAccountSearch";
import { AccountItem } from "../../components/account-item/account_item";
import { shortenAddress } from "../../utils/methods";
import styles from "./account_select.module.scss";

export interface AccountOption {
  address?: string | null;
  name: string;
  spxLockArgs: string;
  [key: string]: any;
}

interface CustomSelectProps {
  accounts: AccountOption[];
  onAccountChange?: (value: string, option?: AccountOption) => void;
  debounceTime?: number;
  searchFields?: string[];
}

export type AccountSelectProps = CustomSelectProps &
  Omit<SelectProps, "options" | "onChange" | "optionRender" | "labelRender">;

const AccountSelect: React.FC<AccountSelectProps> = ({
  accounts,
  onAccountChange,
  debounceTime = 300,
  searchFields,
  ...restProps
}) => {
  const { useBreakpoint } = Grid;
  const screens = useBreakpoint();

  const { searchTerm, filteredAccounts, handleSearch } = useAccountSearch(
    accounts,
    debounceTime,
    searchFields
  );

  const options = filteredAccounts.map((account) => ({
    label: JSON.stringify(account), // Serialize account data to string
    value: account.address,
  }));

  // Render dropdown options
  const optionRender = (option: DefaultOptionType) => {
    if (!option.label) return null;
    const accountData = JSON.parse(option.label as string) as AccountOption; // Deserialize account data from string
    return (
      <AccountItem
        address={accountData.address!}
        name={accountData.name}
        spxLockArgs={accountData.spxLockArgs}
        hasTools={false}
        copyable={false}
      />
    );
  };

  // Render selected account
  const labelRender = (option: DefaultOptionType) => {
    if (!option.label) return null;
    const accountData = JSON.parse(option.label as string) as AccountOption; // Deserialize account data from string
    return screens.md ? (
      <div>{accountData.name} _ {shortenAddress(accountData?.address!, 20, 30)}</div>
    ) : (
      <div>{accountData.name} _ {shortenAddress(accountData?.address!, 10, 15)}</div>
    );
  };

  const handleChange = (value: string, option: any) => {
    if (onAccountChange) {
      const accountData = option.data || option;
      onAccountChange(value, accountData);
    }
  };

  return (
    <Select
      showSearch
      filterOption={false}
      options={options}
      onSearch={handleSearch}
      searchValue={searchTerm}
      optionRender={optionRender}
      labelRender={labelRender}
      onChange={handleChange}
      // allowClear
      placeholder="Select an account from your wallet"
      className={styles.accountSelect}
      {...restProps}
    />
  );
};

export default AccountSelect;