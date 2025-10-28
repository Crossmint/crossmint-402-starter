import { validateEnvironment } from "./helpers/client";
import { Client, type DecodedMessage, type Conversation } from "@xmtp/node-sdk";
import {
  ContentTypeReaction,
  type Reaction,
} from "@xmtp/content-type-reaction";
import { type IntentContent } from "./lib/types/IntentContent";
import { ChatAnthropic } from "@langchain/anthropic";
import { logger } from "./helpers/logger";
import { FundingData, UserProfile } from "./lib/types";
import { loadUserProfile } from "@helpers/loadUserProfile";
import { saveUserProfile } from "services/redis";
import { getMenuType } from "@helpers/toShowMenu";
import { delayedSend } from "@helpers/delayUtils";

import { ActionMenuFactory } from "@helpers/actionMenuFactory";
import { ConversationProcessor } from "@helpers/conversationProcessor";
import { OrderToolWrapper } from "@helpers/orderToolWrapper";
import { WalletOperationsHandler } from "@helpers/walletOperationsHandler";
import { XMTPClientFactory } from "@helpers/xmtpClientFactory";
import {
  IntentHandler,
  type IntentHandlerContext,
} from "@helpers/intentHandlers";
import { UserStateManager, UserContextType } from "@helpers/userStateManager";

const { ANTHROPIC_API_KEY } = validateEnvironment(["ANTHROPIC_API_KEY"]);

class XMTPShoppingBot {
  private xmtpClient!: Client;
  private llm: ChatAnthropic;
  private userStateManager: UserStateManager;
  private actionMenuFactory: ActionMenuFactory;
  private conversationProcessor: ConversationProcessor;
  private orderToolWrapper: OrderToolWrapper;
  private walletOperationsHandler: WalletOperationsHandler;
  private xmtpClientFactory: XMTPClientFactory;

  constructor() {
    this.llm = new ChatAnthropic({
      anthropicApiKey: ANTHROPIC_API_KEY,
      modelName: "claude-sonnet-4-20250514",
      temperature: 1,
    });

    // Initialize helper classes
    this.userStateManager = new UserStateManager();
    this.actionMenuFactory = new ActionMenuFactory();
    this.orderToolWrapper = new OrderToolWrapper(this.userStateManager);
    this.walletOperationsHandler = new WalletOperationsHandler();
    this.xmtpClientFactory = new XMTPClientFactory();

    // Initialize conversation processor (will be set after XMTP client is ready)
    this.conversationProcessor = new ConversationProcessor(
      this.llm,
      this.userStateManager,
      this.actionMenuFactory,
      this.orderToolWrapper,
      null // xmtpClient will be set later
    );
  }

  // Delegate to wallet operations handler
  private async sendActualFundingRequest({
    sender,
    receiver,
    fundingData,
    conversation,
  }: {
    sender: string;
    receiver: string;
    fundingData: FundingData;
    conversation: Conversation;
  }) {
    await this.walletOperationsHandler.sendActualFundingRequest({
      sender,
      receiver,
      fundingData,
      conversation,
    });
  }
  // Delegate to conversation processor
  private async processMessageWithAgent(
    conversation: Conversation,
    userInboxId: string,
    messageContent: string,
    userProfile: UserProfile | null,
    conversationHistory?: DecodedMessage[]
  ) {
    await this.conversationProcessor.processMessageWithAgent(
      conversation,
      userInboxId,
      messageContent,
      userProfile,
      conversationHistory
    );
  }

  private async handleMessage(message: DecodedMessage) {
    const userInboxId = message.senderInboxId;
    const inboxState = await this.xmtpClient.preferences.inboxStateFromInboxIds(
      [userInboxId]
    );
    const hostWalletAddress = inboxState[0].identifiers[0].identifier as string;
    try {
      const conversation =
        await this.xmtpClient.conversations.getConversationById(
          message.conversationId
        );
      if (!conversation) {
        return;
      }
      if (message.contentType?.typeId === "text") {
        const messageContent = message.content as string;

        // Send automatic reaction to the received message
        try {
          const reactions = ["🤔", "👀", "🫡", "💫", "⚡"];
          const randomReaction =
            reactions[Math.floor(Math.random() * reactions.length)];

          const reaction: Reaction = {
            reference: message.id,
            action: "added",
            content: randomReaction,
            schema: "unicode", // Required schema property
          };

          await conversation.send(
            reaction as unknown as string,
            ContentTypeReaction
          );

          logger.info("Sent automatic reaction", {
            messageId: message.id,
            senderInboxId: message.senderInboxId,
            reaction: randomReaction,
          });
        } catch (reactionError) {
          logger.error("Failed to send automatic reaction", {
            error:
              reactionError instanceof Error
                ? reactionError.message
                : String(reactionError),
            messageId: message.id,
            senderInboxId: message.senderInboxId,
          });
          // Continue processing even if reaction fails
        }

        await conversation.sync();
        const conversationHistory = await conversation.messages();

        // Filter out the current message from history to prevent duplication
        // The agents will add the current message themselves
        const filteredHistory = conversationHistory.filter(
          (msg) => msg.id !== message.id
        );

        const menuType = getMenuType(messageContent, conversationHistory);
        if (menuType) {
          this.userStateManager.setUserContext(userInboxId, "menu");

          switch (menuType) {
            case "help":
              await this.actionMenuFactory.sendHelpMenu(
                conversation,
                userInboxId
              );
              break;

            case "agents":
              await this.actionMenuFactory.sendAgentsMenu(
                conversation,
                userInboxId
              );
              break;

            case "clear":
              // Clear user state and conversation context
              this.userStateManager.clearAllUserState(userInboxId);
              await delayedSend(
                conversation,
                "🗑️ Context cleared! Starting fresh conversation."
              );
              break;

            case "main":
            default:
              await this.actionMenuFactory.sendMainActionMenu(
                conversation,
                userInboxId
              );
              break;
          }

          return;
        }

        const userProfile = {
          ...(await loadUserProfile(userInboxId)),
          hostWalletAddress,
        };
        await saveUserProfile(userProfile);

        await this.processMessageWithAgent(
          conversation,
          userInboxId,
          messageContent,
          userProfile,
          filteredHistory
        );
      } else if (message.contentType?.typeId === "intent") {
        const intentContent = message.content as IntentContent;
        logger.user("Processing intent", intentContent.actionId);

        try {
          // Create intent handler context
          const handlerContext: IntentHandlerContext = {
            conversation,
            userInboxId,
            setUserContext: (id: string, context: UserContextType) => {
              this.userStateManager.setUserContext(id, context);
            },
            handleBalanceCheck:
              this.walletOperationsHandler.handleBalanceCheck.bind(
                this.walletOperationsHandler
              ),
            currentFundingRequirement:
              this.userStateManager.getAllFundingRequirements(),
            clearFundingRequirement: (userInboxId: string) => {
              this.userStateManager.clearFundingRequirement(userInboxId);
            },
            sendActualFundingRequest: this.sendActualFundingRequest.bind(this),
            loadUserProfile,
            processMessageWithAgent: this.processMessageWithAgent.bind(this),
            saveUserProfile,
            actionMenuFactory: this.actionMenuFactory,
            xmtpClient: this.xmtpClient,
          };

          const intentHandler = new IntentHandler(handlerContext);

          // Try each handler category in order
          const handled =
            (await intentHandler.handleOrderManagement(
              intentContent.actionId
            )) ||
            (await intentHandler.handleAssistantActivation(
              intentContent.actionId
            )) ||
            (await intentHandler.handleProfileManagement(
              intentContent.actionId
            )) ||
            (await intentHandler.handleInformationalActions(
              intentContent.actionId
            )) ||
            (await intentHandler.handleQuickBuy(intentContent.actionId)) ||
            (await intentHandler.handleQuickReply(intentContent.actionId));

          if (!handled) {
            await delayedSend(
              conversation,
              `❌ Unknown action: ${intentContent.actionId}`
            );
            logger.warn("Unknown intent action", {
              actionId: intentContent.actionId,
              userInboxId,
            });
          }
        } catch (error) {
          logger.error("Error processing intent", {
            error: error instanceof Error ? error.message : String(error),
            actionId: intentContent.actionId,
            userInboxId,
          });
          await delayedSend(
            conversation,
            `❌ Error processing action: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } else {
        logger.debug("Skipping unsupported message type", {
          contentType: message.contentType?.typeId,
          senderInboxId: message.senderInboxId,
        });
      }
    } catch (error) {
      logger.error("Error handling message", {
        error,
        messageContext: {
          senderInboxId: message?.senderInboxId,
          messageContent: message?.content,
          conversationId: message?.conversationId,
          contentType: message?.contentType?.typeId,
        },
      });
    }
  }

  async initialize() {
    logger.info("Initializing XMTP Shopping Bot...");

    // Create XMTP client using factory
    const config = XMTPClientFactory.createConfig();
    this.xmtpClient = await this.xmtpClientFactory.createClient(config);

    // Update conversation processor with XMTP client
    this.conversationProcessor = new ConversationProcessor(
      this.llm,
      this.userStateManager,
      this.actionMenuFactory,
      this.orderToolWrapper,
      this.xmtpClient
    );

    // Start message stream
    await this.xmtpClientFactory.startMessageStream(
      this.handleMessage.bind(this)
    );
  }
}

async function main() {
  logger.info("Starting XMTP Shopping Bot...");
  const bot = new XMTPShoppingBot();
  await bot.initialize();
}

main().catch((error) => logger.error("Fatal error", error));
