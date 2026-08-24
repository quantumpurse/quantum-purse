import {
  Button,
  Checkbox,
  Flex,
  Input,
  Typography,
  message,
  Modal,
  Divider,
  Tag,
} from "antd";
import React, { useState, useRef, useEffect } from "react";
import { cx, formatError } from "../../../utils/methods";
import styles from "./XXX.module.scss";
import { quantum } from "../../../store/models/wallet";
import {
  createBindingSession,
  completeBinding,
  fetchBoundAddresses,
  fetchServerPublicKey,
  verifyAppendAck,
  extractAccountPubkey,
  AddressBindingEvent,
  type AccountInfo,
} from "../../../../core/daov2/dao_v2";
import { downloadReceipt } from "../../../../core/daov2/receipt";
import { Hex } from "@ckb-ccc/core";
import { Authentication, AuthenticationRef } from "../../../components";

const { Title, Text } = Typography;

const XXX: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>("");
  const [isBinding, setIsBinding] = useState<boolean>(false);
  const [accountInfoModalVisible, setAccountInfoModalVisible] = useState<boolean>(false);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  // The account key parsed from the pasted API key, held for the confirm step.
  const [accountPubkey, setAccountPubkey] = useState<string>("");
  const [addressesToBind, setAddressesToBind] = useState<string[]>([]);
  const [lockScriptArgs, setLockScriptArgs] = useState<string[]>([]);
  const [selectedAddressIndices, setSelectedAddressIndices] = useState<Set<number>>(new Set());
  const authenticationRef = useRef<AuthenticationRef>(null);
  const [passwordResolver, setPasswordResolver] = useState<{
    resolve: (password: Uint8Array) => void;
    reject: () => void;
  } | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Set and clean up the requestPassword callback
  useEffect(() => {
    if (quantum) {
      quantum.requestPassword = (resolve, reject) => {
        setPasswordResolver({ resolve, reject });
        authenticationRef.current?.open();
      };
    }
    return () => {
      if (quantum) {
        quantum.requestPassword = undefined;
      }
    };
  }, []);

  // For when users use the binding api key and hit "Start"
  const handleStartBinding = async () => {
    if (!apiKey.trim()) {
      message.warning("Please enter an API key");
      return;
    }

    if (!quantum) {
      message.error("Wallet not initialized");
      return;
    }

    setIsBinding(true);

    try {
      // Step0: Parse the pasted composite key BEFORE any network call. The
      // embedded pubkey is the wallet's only trustworthy source for the
      // account key (the DAO website verified it against the user's passkey
      // before display); a malformed paste must fail loudly here.
      const trimmedKey = apiKey.trim();
      const accountPubkey = extractAccountPubkey(trimmedKey);

      // Get all lock script arguments and convert to addresses.
      const allLockArgs = await quantum.getAllLockScriptArgs();
      const allAddresses = allLockArgs.map(lockArg =>
        quantum.getAddress(lockArg as Hex)
      );

      // Step1: Ask which addresses are already bound and subtract them here.
      // The server is never told what this wallet holds, so it cannot name an
      // unbound address to keep it out of the user's choice.
      const { boundAddresses, accountInfo } = await fetchBoundAddresses(trimmedKey);

      const boundSet = new Set(boundAddresses);
      const unboundAddresses = allAddresses.filter((addr) => !boundSet.has(addr));
      if (unboundAddresses.length === 0) {
        message.info({
          content: "All your addresses are already bound to this account.",
          duration: 5,
        });
        return;
      }

      const addressToLockArgs = new Map<string, string>();
      for (let i = 0; i < allAddresses.length; i++) {
        addressToLockArgs.set(allAddresses[i], allLockArgs[i]);
      }
      const unboundLockArgs = unboundAddresses.map((addr) => {
        const lockArgs = addressToLockArgs.get(addr);
        if (!lockArgs) throw new Error(`No lock args found for address ${addr}`);
        return lockArgs;
      });

      // Step2: Let the user choose. The session is opened only after they
      // confirm, so the event lists exactly their choice — which is what lets
      // the wallet demand the server return that same set, unaltered.
      setAccountPubkey(accountPubkey);
      setAccountInfo(accountInfo);
      setAddressesToBind(unboundAddresses);
      setLockScriptArgs(unboundLockArgs);
      setSelectedAddressIndices(new Set(unboundAddresses.map((_, i) => i)));

      // Show the account confirmation modal.
      setAccountInfoModalVisible(true);
    } catch (error) {
      console.error("Bind error:", error);
      Modal.error({
        title: 'Failed to Bind API Key',
        content: (
          <div>
            <p>{formatError(error)}</p>
            <p style={{ marginTop: '10px', fontSize: '12px', color: 'gray' }}>
              Make sure the XXX server is running on http://localhost:8080
            </p>
          </div>
        ),
        centered: true,
        style: { transform: 'scale(0.9)' },
        transitionName: '',
        maskTransitionName: '',
      });
    } finally {
      setIsBinding(false);
    }
  };

  const handleBinding = async () => {
    if (!quantum) {
      message.error("Wallet not initialized");
      return;
    }

    if (selectedAddressIndices.size === 0) {
      message.warning("Select at least one address to bind.");
      return;
    }

    let dismissLoading: (() => void) | null = null;

    try {
      // Show loading state (duration 0 = infinite, dismissed manually).
      dismissLoading = message.loading('Signing challenges and completing address binding...', 0);

      // The user's choice, in the order the wallet listed it.
      const selectedAddress = addressesToBind.filter((_, i) => selectedAddressIndices.has(i));
      const chosenLockArgs = lockScriptArgs.filter((_, i) => selectedAddressIndices.has(i));

      // Step3: Open the session for exactly those addresses, then require the event
      // to list that same set. A server that drops one is removing voting
      // power, and after this point every later check would still pass.
      const response = await createBindingSession(apiKey.trim(), selectedAddress);
      if (!response.payload) {
        throw new Error("Invalid response from server — missing payload.");
      }

      const serverPublicKey = await fetchServerPublicKey();

      // Step4: verify the intention is stuill intact from the returned payload from server
      await AddressBindingEvent.verifyBinding(
        response.payload as any,
        serverPublicKey,
        selectedAddress,
        accountPubkey,
      );

      // Step5: Prepare to sign. Signatures are positional — slot i attests
      // ckb_addresses[i] — so the keys must follow the event's order, not
      // ours. verifyBinding above compares the two lists as sets, which
      // accepts a reordered reply, so re-pair by address rather than assume
      // the server echoed our order back.
      const lockArgsByAddress = new Map<string, string>();
      selectedAddress.forEach((addr, i) => lockArgsByAddress.set(addr, chosenLockArgs[i]));

      const orderedLockArgs = response.payload.ckb_addresses.map((addr) => {
        const lockArgs = lockArgsByAddress.get(addr);
        // Defense in depth: set equality already proved every returned address is
        // one we chose. Kept so a future looser check fails here, loudly,
        // instead of signing the wrong address with the wrong key.
        if (!lockArgs) throw new Error(`No lock args found for address ${addr}`);
        return lockArgs;
      });

      // Derive challenges, sign every listed address, and submit.
      const { response: verifyResponse, event } = await completeBinding(
        apiKey.trim(),
        response.payload,
        orderedLockArgs,
        quantum,
      );

      // Verify the server's append ack, then download the binding receipt
      // for fraud-proof archival. On an invalid attestation the co-signed
      // event is saved without the ack (an unverifiable ack proves nothing
      // and must not masquerade as a receipt) and the flow stops loudly.
      try {
        await verifyAppendAck(event.event_hash, verifyResponse);
      } catch {
        downloadReceipt(event, null, `binding-${Date.now()}.json`);
        message.error(
          "Server attestation failed verification — receipt saved; the event may not be safely appended.",
          8,
        );
        return;
      }
      downloadReceipt(event, verifyResponse, `binding-${Date.now()}.json`);

      // Close modal.
      setAccountInfoModalVisible(false);

      // Show success message.
      const boundCount = verifyResponse.bound_addresses
        ? verifyResponse.bound_addresses.length
        : selectedAddressIndices.size;
      message.success({
        content: `Successfully bound ${boundCount} address(es) to your account!`,
        duration: 5,
      });

      // Clear state after successful binding.
      setAccountInfo(null);
      setAccountPubkey("");
      setAddressesToBind([]);
      setLockScriptArgs([]);
      setSelectedAddressIndices(new Set());
      setApiKey("");

    } catch (error) {
      console.error("Failed to complete address binding:", error);
      Modal.error({
        title: 'Failed to Bind Addresses',
        content: formatError(error),
        centered: true,
        style: { transform: 'scale(0.9)' },
        transitionName: '',
        maskTransitionName: '',
      });
    } finally {
      dismissLoading?.();
      setIsAuthenticating(false);
      authenticationRef.current?.close();
    }
  };

  // Handle password submission from Authentication modal
  const authenCallback = async (password: Uint8Array) => {
    if (passwordResolver) {
      setIsAuthenticating(true);
      passwordResolver.resolve(password);
      setPasswordResolver(null);
    }
  };

  const handleCancelBinding = () => {
    setAccountInfoModalVisible(false);
    setAccountInfo(null);
    setAccountPubkey("");
    setAddressesToBind([]);
    setLockScriptArgs([]);
    setSelectedAddressIndices(new Set());
    message.info("Address binding cancelled");
  };

  return (
    <section className={cx(styles.daov2, "panel")}>
      <Flex vertical gap="large" style={{ width: "100%" }}>
        <div>
          <Title level={4} style={{ color: 'white' }}>XXX Configuration</Title>
          <Text type="secondary" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
            Connect your wallet to the XXX server by providing your API key
          </Text>
        </div>

        <Flex vertical gap="middle" style={{ width: "100%" }}>
          <div>
            <Text strong style={{ color: 'white' }}>API Key</Text>
            <Text type="secondary" style={{ marginLeft: 8, color: 'rgba(255, 255, 255, 0.65)' }}>
              (Generated from XXX server)
            </Text>
          </div>

          <Flex gap={8} style={{ width: "100%" }}>
            <Input.Password
              placeholder="Enter your XXX API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              size="large"
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              onClick={handleStartBinding}
              loading={isBinding}
              disabled={isBinding}
              size="large"
            >
              Start
            </Button>
          </Flex>
          <Text type="secondary" style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)' }}>
            This starts a 20-second binding session. Review the account info and confirm before it expires.
          </Text>
        </Flex>
      </Flex>

      {/* Account Information Modal */}
      <Modal
        title="Confirm XXX Account Binding"
        open={accountInfoModalVisible}
        onOk={handleBinding}
        onCancel={handleCancelBinding}
        okText={`Confirm & Sign (${selectedAddressIndices.size})`}
        okButtonProps={{ disabled: selectedAddressIndices.size === 0 }}
        cancelText="Cancel"
        width={600}
        centered
      >
        {accountInfo && (
          <Flex vertical gap="middle">
            <div>
              <Title level={5}>Account Information</Title>
              <Text type="secondary">
                Please confirm this is your XXX account before binding your addresses
              </Text>
            </div>

            <Divider style={{ margin: '12px 0' }} />

            <Flex vertical gap="small" style={{ width: '100%' }}>
              <Flex justify="space-between">
                <Text strong>Username:</Text>
                <Text>{accountInfo.username}</Text>
              </Flex>

              <Flex justify="space-between">
                <Text strong>Email:</Text>
                <Text>{accountInfo.email}</Text>
              </Flex>

              <Flex justify="space-between">
                <Text strong>User ID:</Text>
                <Text type="secondary" style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                  {accountInfo.user_id}
                </Text>
              </Flex>
            </Flex>

            <Divider style={{ margin: '12px 0' }} />

            <div>
              <Flex justify="space-between" align="center">
                <Text strong>Select Addresses to Bind ({selectedAddressIndices.size} of {addressesToBind.length}):</Text>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    if (selectedAddressIndices.size === addressesToBind.length) {
                      setSelectedAddressIndices(new Set());
                    } else {
                      setSelectedAddressIndices(new Set(addressesToBind.map((_, i) => i)));
                    }
                  }}
                >
                  {selectedAddressIndices.size === addressesToBind.length ? 'Deselect All' : 'Select All'}
                </Button>
              </Flex>
              <Flex vertical gap={8} style={{ marginTop: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {addressesToBind.map((address, index) => (
                  <Checkbox
                    key={index}
                    checked={selectedAddressIndices.has(index)}
                    onChange={(e) => {
                      setSelectedAddressIndices(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) {
                          next.add(index);
                        } else {
                          next.delete(index);
                        }
                        return next;
                      });
                    }}
                  >
                    <Tag style={{ fontFamily: 'monospace', fontSize: '11px', margin: 0 }}>
                      {address.substring(0, 10)}...{address.substring(address.length - 8)}
                    </Tag>
                  </Checkbox>
                ))}
              </Flex>
            </div>

            <Text type="warning" style={{ fontSize: '12px' }}>
              By confirming, you will sign a challenge for each address to prove ownership.
            </Text>
          </Flex>
        )}
      </Modal>

      {/* Authentication modal for password input */}
      <Authentication
        ref={authenticationRef}
        authenCallback={authenCallback}
        loading={isAuthenticating}
        title="Sign Address Binding"
        description="Enter your password to sign the address binding challenges"
        afterClose={() => {
          if (passwordResolver) {
            passwordResolver.reject();
            setPasswordResolver(null);
          }
        }}
      />
    </section>
  );
};

export default XXX;