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
  fetchServerPublicKey,
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
  const [bindingPayload, setBindingPayload] = useState<AddressBindingEvent | null>(null);
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
      // Get all lock script arguments and convert to addresses.
      const allLockArgs = await quantum.getAllLockScriptArgs();
      const allAddresses = allLockArgs.map(lockArg =>
        quantum.getAddress(lockArg as Hex)
      );

      // Step1: Open a binding session and get challenges from the server.
      const response = await createBindingSession(apiKey, allAddresses);

      if (!response.payload || !response.account_info) {
        throw new Error("Invalid response from server — missing payload or account info.");
      }

      // The payload's ckb_addresses are the unbound subset (BE already filtered).
      const unboundAddresses = response.payload.ckb_addresses;
      if (unboundAddresses.length === 0) {
        message.info({
          content: "All your addresses are already bound to this account.",
          duration: 5,
        });
        return;
      }

      // Step2: Fetch the server's public key and verify the payload before showing
      // the confirmation modal. This ensures the wallet only signs verified data.
      const serverPublicKey = await fetchServerPublicKey();
      await AddressBindingEvent.verifyBinding(response.payload as any, serverPublicKey, allAddresses);

      // Build lockScriptArgs in the same order as payload.ckb_addresses
      // to guarantee index alignment regardless of BE ordering.
      const addressToLockArgs = new Map<string, string>();
      for (let i = 0; i < allAddresses.length; i++) {
        addressToLockArgs.set(allAddresses[i], allLockArgs[i]);
      }
      const unboundLockArgs = unboundAddresses.map((addr) => {
        const lockArgs = addressToLockArgs.get(addr);
        if (!lockArgs) throw new Error(`No lock args found for address ${addr}`);
        return lockArgs;
      });

      // Store verified data for the confirmation step. All addresses selected by default.
      setAccountInfo(response.account_info);
      setBindingPayload(response.payload);
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

    if (!bindingPayload) {
      message.error("No binding payload available. Please retry.");
      return;
    }

    let dismissLoading: (() => void) | null = null;

    try {
      // Show loading state (duration 0 = infinite, dismissed manually).
      dismissLoading = message.loading('Signing challenges and completing address binding...', 0);

      // Derive challenges, sign them, and submit the completed event.
      // Only selected addresses are signed; the rest get empty signatures.
      const { response, event } = await completeBinding(
        apiKey,
        bindingPayload,
        lockScriptArgs,
        quantum,
        Array.from(selectedAddressIndices),
      );

      // Download binding receipt for fraud-proof archival.
      downloadReceipt(event, response.commit_hash, `binding-${Date.now()}.json`);

      // Close modal.
      setAccountInfoModalVisible(false);

      // Show success message.
      const boundCount = response.bound_addresses ? response.bound_addresses.length : addressesToBind.length;
      message.success({
        content: `Successfully bound ${boundCount} address(es) to your account!`,
        duration: 5,
      });

      // Clear state after successful binding.
      setAccountInfo(null);
      setBindingPayload(null);
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
    setBindingPayload(null);
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