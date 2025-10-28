/* eslint-disable no-unused-vars */
import { Client, type XmtpEnv, type DecodedMessage } from "@xmtp/node-sdk";
import { WalletSendCallsCodec } from "@xmtp/content-type-wallet-send-calls";
import { ReactionCodec } from "@xmtp/content-type-reaction";
import { ActionsCodec } from "../lib/types/ActionsContent";
import { IntentCodec } from "../lib/types/IntentContent";
import {
  createSigner,
  getEncryptionKeyFromHex,
  logAgentDetails,
  validateEnvironment,
  getDbPath,
} from "./client";
import { initializeRedis } from "./redis";
import { logger } from "./logger";

export interface XMTPClientConfig {
  walletKey: string;
  encryptionKey: string;
  environment: string;
}

export class XMTPClientFactory {
  private client?: Client;

  async createClient(config: XMTPClientConfig): Promise<Client> {
    logger.info("Initializing XMTP client...");

    // Initialize Redis first
    await initializeRedis();

    // Create signer and encryption key
    const signer = createSigner(config.walletKey);
    const dbEncryptionKey = getEncryptionKeyFromHex(config.encryptionKey);
    const signerIdentifier = (await signer.getIdentifier()).identifier;

    // Create XMTP client
    this.client = (await Client.create(signer, {
      dbEncryptionKey,
      env: config.environment as XmtpEnv,
      codecs: [
        new WalletSendCallsCodec(),
        new ReactionCodec(),
        new ActionsCodec(),
        new IntentCodec(),
      ],
      dbPath: getDbPath(`${config.environment}-${signerIdentifier}`),
    })) as Client;

    // Log agent details
    void logAgentDetails(this.client);

    logger.info("XMTP client configured successfully");

    // Sync conversations
    logger.xmtp("Syncing conversations...");
    await this.client.conversations.sync();

    logger.success("XMTP client initialized successfully");

    return this.client;
  }

  async startMessageStream(
    messageHandler: (message: DecodedMessage) => Promise<void>
  ): Promise<void> {
    if (!this.client) {
      throw new Error("XMTP client not initialized. Call createClient first.");
    }

    logger.xmtp("Starting message stream...");

    await this.client.conversations.streamAllMessages(
      async (error, message) => {
        if (error) {
          logger.error("Streaming error", error);
          return;
        }

        if (!message) {
          logger.debug("Skipping null message");
          return;
        }

        if (
          message.senderInboxId.toLowerCase() ===
          this.client!.inboxId.toLowerCase()
        ) {
          logger.debug("Skipping own message");
          return;
        }

        logger.separator();
        logger.user("Processing message", message.senderInboxId);

        try {
          const startTime = Date.now();

          await messageHandler(message);

          logger.timing("Message processing", Date.now() - startTime);
          logger.user("Finished processing message", message.senderInboxId);
        } catch (messageError) {
          logger.error("Error processing message", {
            error: messageError,
            messageDetails: {
              id: message?.id,
              senderInboxId: message?.senderInboxId,
              contentType: message?.contentType?.typeId,
            },
          });
        }

        logger.separator();
      }
    );
  }

  getClient(): Client {
    if (!this.client) {
      throw new Error("XMTP client not initialized. Call createClient first.");
    }
    return this.client;
  }

  static createConfig(): XMTPClientConfig {
    const { WALLET_KEY, ENCRYPTION_KEY, XMTP_ENV } = validateEnvironment([
      "WALLET_KEY",
      "ENCRYPTION_KEY",
      "XMTP_ENV",
    ]);

    return {
      walletKey: WALLET_KEY,
      encryptionKey: ENCRYPTION_KEY,
      environment: XMTP_ENV,
    };
  }
}
