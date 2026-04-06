import { Cascader, Form, Tooltip } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { SpxVariant } from "../../../core/quantum_purse";
import { useLocation } from "react-router-dom";
import styles from './param_selector.module.scss';

const WALLET_TYPE_OPTIONS = [
  {
    value: "mldsa65",
    label: "ML-DSA-65 (FIPS 204)",
    children: [
      { value: "mldsa65", label: "ML-DSA-65 — Lattice-based, compact signatures" },
    ],
  },
  {
    value: "sphincs+",
    label: "SPHINCS+ (FIPS 205)",
    children: [
      {
        value: "128",
        label: "128-bit security (36-word mnemonic)",
        children: [
          { value: SpxVariant.Sha2128S, label: "SHA2_128s — recommended" },
          { value: SpxVariant.Sha2128F, label: "SHA2_128f — fast signing" },
          { value: SpxVariant.Shake128S, label: "SHAKE_128s" },
          { value: SpxVariant.Shake128F, label: "SHAKE_128f" },
        ],
      },
      {
        value: "192",
        label: "192-bit security (54-word mnemonic)",
        children: [
          { value: SpxVariant.Sha2192S, label: "SHA2_192s" },
          { value: SpxVariant.Sha2192F, label: "SHA2_192f" },
          { value: SpxVariant.Shake192S, label: "SHAKE_192s" },
          { value: SpxVariant.Shake192F, label: "SHAKE_192f" },
        ],
      },
      {
        value: "256",
        label: "256-bit security (72-word mnemonic)",
        children: [
          { value: SpxVariant.Sha2256S, label: "SHA2_256s" },
          { value: SpxVariant.Sha2256F, label: "SHA2_256f" },
          { value: SpxVariant.Shake256S, label: "SHAKE_256s" },
          { value: SpxVariant.Shake256F, label: "SHAKE_256f" },
        ],
      },
    ],
  },
];

const ParamsetSelector: React.FC = () => {
  const isImport = useLocation().pathname === "/import-wallet";

  return (
    <Form.Item
      className={styles.paramsetSelector}
      label={
        <span style={{ color: 'var(--gray-01)' }}>
          Wallet Type
          <Tooltip
            title={
              isImport
                ? "Select the scheme and parameter set you used when creating this wallet."
                : "Choose your signature scheme. ML-DSA-65 is a lattice-based NIST standard with compact signatures. SPHINCS+ is a hash-based alternative with 12 parameter variants."
            }
          >
            <QuestionCircleOutlined style={{ marginLeft: 8 }} />
          </Tooltip>
        </span>
      }
      name="parameterSet"
      rules={[{ required: true, message: "Please select a wallet type" }]}
      // Cascader returns an array — normalise to the leaf value for the rest of the form
      getValueFromEvent={(val: (string | number)[]) => val ? val[val.length - 1] : undefined}
    >
      <Cascader
        size="large"
        placeholder="Select scheme → variant"
        options={WALLET_TYPE_OPTIONS}
        expandTrigger="hover"
        displayRender={(labels) => labels[labels.length - 1]}
        style={{ width: "100%" }}
      />
    </Form.Item>
  );
};

export default ParamsetSelector;
