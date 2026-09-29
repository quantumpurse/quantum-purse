import QuantumPurse, { SpxVariant } from "../../core/quantum_purse";

const usePasswordValidator = (variant: SpxVariant) => {
  const formatValidator = (password: Uint8Array) => {
    if (!password) {
      return Promise.resolve();
    }

    try {
      QuantumPurse.checkPassword(password);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(new Error(error as string));
    } finally {
      password.fill(0);
    }
  };

  const entropyLevelValidator = async (_: any, password: Uint8Array) => {
    if (!password) {
      return Promise.resolve();
    }
    try {
      const level = QuantumPurse.checkPassword(password);
      const entropyMap = {
        [SpxVariant.Sha2128F]: 128,
        [SpxVariant.Shake128F]: 128,
        [SpxVariant.Sha2128S]: 128,
        [SpxVariant.Shake128S]: 128,
        [SpxVariant.Sha2192F]: 192,
        [SpxVariant.Shake192F]: 192,
        [SpxVariant.Sha2192S]: 192,
        [SpxVariant.Shake192S]: 192,
        [SpxVariant.Sha2256F]: 256,
        [SpxVariant.Shake256F]: 256,
        [SpxVariant.Sha2256S]: 256,
        [SpxVariant.Shake256S]: 256,
      };
      const requiredEntropy = entropyMap[variant] || 128;
      if (level < requiredEntropy) {
        return Promise.reject(new Error("abc"));
      }
      return Promise.resolve();
    } catch (error) {
      // Ignore errors here
      return Promise.resolve();
    } finally {
      password.fill(0);
    }
  };

  const rules = [
    { required: true, message: "" },
    {
      validator: (_: any, value: Uint8Array) => {
        return formatValidator(value);
      },
    },
    {
      validator: entropyLevelValidator,
      message: "Warning: weak password! Consider passphrases or lengthening it!",
      warningOnly: true,
    },
  ];
  return { rules };
};

export default usePasswordValidator;
