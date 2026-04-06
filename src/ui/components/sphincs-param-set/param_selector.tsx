import { Form, Select, Tooltip } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { SpxVariant } from "../../../core/quantum_purse";
import { useLocation } from "react-router-dom";
import styles from './param_selector.module.scss';

const ParamsetSelector: React.FC = () => {
  return (
    <Form.Item
      className={styles.paramsetSelector}
      label={
        <span style={{ color: 'var(--gray-01)' }}>
          Wallet Type
          <Tooltip
            title={
              useLocation().pathname === "/import-wallet"
                ? "What SPHINCS+ parameter set did you back up with the input seed phrase?"
                : "There are 12 SPHINCS+ parameter sets in total, each will determine your wallet type. Sha2_256s is recommended if you have no reference!"
            }
          >
            <QuestionCircleOutlined style={{ marginLeft: 8 }} />
          </Tooltip>
        </span>
      }
      name="parameterSet"
      rules={[{ required: true, message: "" }]}
    >
      <Select
        size="large"
        placeholder="Select a wallet type"
      >
        <Select.OptGroup label="— ML-DSA-65 (FIPS 204) —">
          <Select.Option value="mldsa65">ML-DSA-65 ✦ Lattice-based, compact signatures</Select.Option>
        </Select.OptGroup>
        <Select.OptGroup label="— SPHINCS+ (FIPS 205) — 128-bit | 36-word mnemonic">
          <Select.Option value={SpxVariant.Sha2128S}>SHA2_128s</Select.Option>
          <Select.Option value={SpxVariant.Sha2128F}>SHA2_128f</Select.Option>
          <Select.Option value={SpxVariant.Shake128S}>SHAKE_128s</Select.Option>
          <Select.Option value={SpxVariant.Shake128F}>SHAKE_128f</Select.Option>
        </Select.OptGroup>
        <Select.OptGroup label="SPHINCS+ — 192-bit | 54-word mnemonic">
          <Select.Option value={SpxVariant.Sha2192S}>SHA2_192s</Select.Option>
          <Select.Option value={SpxVariant.Sha2192F}>SHA2_192f</Select.Option>
          <Select.Option value={SpxVariant.Shake192S}>SHAKE_192s</Select.Option>
          <Select.Option value={SpxVariant.Shake192F}>SHAKE_192f</Select.Option>
        </Select.OptGroup>
        <Select.OptGroup label="SPHINCS+ — 256-bit | 72-word mnemonic">
          <Select.Option value={SpxVariant.Sha2256S}>SHA2_256s</Select.Option>
          <Select.Option value={SpxVariant.Sha2256F}>SHA2_256f</Select.Option>
          <Select.Option value={SpxVariant.Shake256S}>SHAKE_256s</Select.Option>
          <Select.Option value={SpxVariant.Shake256F}>SHAKE_256f</Select.Option>
        </Select.OptGroup>
      </Select>
    </Form.Item>
  );
};

export default ParamsetSelector;
