import {
  Button,
  Flex,
  Input,
  Typography,
  message,
  Modal,
  Divider,
  Tag,
  Space,
} from "antd";
import React, { useState } from "react";
import { cx, formatError } from "../../../utils/methods";
import styles from "./XXX.module.scss";
import { quantum } from "../../../store/models/wallet";
import { createBindingSession } from "../../../../core/dao_v2";
import { Hex } from "@ckb-ccc/core";

const { Title, Text } = Typography;

const XXX: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>("");
  const [isBinding, setIsBinding] = useState<boolean>(false);
  const [accountInfoModalVisible, setAccountInfoModalVisible] = useState<boolean>(false);
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [addressesToBind, setAddressesToBind] = useState<string[]>([]);

  const handleBind = async () => {
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
      // Get all lock script arguments
      const lockScriptArgs = await quantum.getAllLockScriptArgs();

      // Convert each lock script arg to an address
      const addresses = lockScriptArgs.map(lockArg =>
        quantum.getAddress(lockArg as Hex)
      );

      // Store addresses for later use
      setAddressesToBind(addresses);

      // Call createBindingSession with the API key and addresses
      const response = await createBindingSession(apiKey, addresses);

      // Handle the response - check for account_info and challenges
      if (response.account_info && response.challenges) {
        // Store the account info and challenges
        setAccountInfo(response.account_info);
        setChallenges(response.challenges);

        // Show the account confirmation modal
        setAccountInfoModalVisible(true);
      } else {
        throw new Error("Invalid response from server - missing account info or challenges");
      }
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

  const handleConfirmBinding = async () => {
    // This will be implemented in the next step for signing challenges
    // For now, just close the modal
    setAccountInfoModalVisible(false);
    message.info("Binding confirmation will be implemented in next step");
  };

  const handleCancelBinding = () => {
    setAccountInfoModalVisible(false);
    setAccountInfo(null);
    setChallenges([]);
    setAddressesToBind([]);
    message.info("Address binding cancelled");
  };

  return (
    <section className={cx(styles.daov2, "panel")}>
      <Flex vertical gap="large" style={{ width: "100%" }}>
        <div>
          <Title level={4}>XXX Configuration</Title>
          <Text type="secondary">
            Connect your wallet to the XXX server by providing your API key
          </Text>
        </div>

        <Flex vertical gap="middle" style={{ width: "100%" }}>
          <div>
            <Text strong>API Key</Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>
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
              onClick={handleBind}
              loading={isBinding}
              disabled={isBinding}
              size="large"
            >
              Bind
            </Button>
          </Flex>

          <Text type="secondary" style={{ fontSize: "12px" }}>
            Note: The API key will be securely stored and used to authenticate
            with the XXX server for enhanced features.
          </Text>
        </Flex>
      </Flex>

      {/* Account Information Modal */}
      <Modal
        title="Confirm XXX Account Binding"
        open={accountInfoModalVisible}
        onOk={handleConfirmBinding}
        onCancel={handleCancelBinding}
        okText="Confirm & Sign"
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

              {accountInfo.display_name && (
                <Flex justify="space-between">
                  <Text strong>Display Name:</Text>
                  <Text>{accountInfo.display_name}</Text>
                </Flex>
              )}

              <Flex justify="space-between">
                <Text strong>User ID:</Text>
                <Text type="secondary" style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                  {accountInfo.user_id}
                </Text>
              </Flex>
            </Flex>

            <Divider style={{ margin: '12px 0' }} />

            <div>
              <Text strong>Addresses to Bind ({addressesToBind.length}):</Text>
              <Flex vertical gap={8} style={{ marginTop: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                {addressesToBind.map((address, index) => (
                  <Tag key={index} style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                    {address.substring(0, 10)}...{address.substring(address.length - 8)}
                  </Tag>
                ))}
              </Flex>
            </div>

            <Text type="warning" style={{ fontSize: '12px' }}>
              By confirming, you will sign a challenge for each address to prove ownership.
            </Text>
          </Flex>
        )}
      </Modal>
    </section>
  );
};

export default XXX;