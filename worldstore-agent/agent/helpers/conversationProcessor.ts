/* eslint-disable no-unused-vars */
import { Conversation, DecodedMessage, type Client } from "@xmtp/node-sdk";
import { ChatAnthropic } from "@langchain/anthropic";
import { AgentState, AGENT_EMOJIS, UserProfile } from "../lib/types";
import { UserStateManager, UserContextType } from "./userStateManager";
import { ActionMenuFactory } from "./actionMenuFactory";
import { WAITING_MESSAGE } from "./constants";
import { createShoppingAgent, createProfileAgent } from "../lib/agents";
import { OrderToolWrapper } from "./orderToolWrapper";

export interface AgentConfig {
  llm: ChatAnthropic;
  currentFundingRequirement: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  wrapOrderProductTool: () => any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export class ConversationProcessor {
  constructor(
    private llm: ChatAnthropic,
    private userStateManager: UserStateManager,
    private actionMenuFactory: ActionMenuFactory,
    private orderToolWrapper: OrderToolWrapper,
    private xmtpClient: Client | null
  ) {}

  async processMessageWithAgent(
    conversation: Conversation,
    userInboxId: string,
    messageContent: string,
    userProfile: UserProfile | null,
    conversationHistory?: DecodedMessage[]
  ): Promise<void> {
    // Determine which agent to use based on user context
    const currentContext = this.userStateManager.getUserContext(userInboxId);
    const agentToUse = currentContext === "menu" ? "general" : currentContext;

    // Send waiting message with appropriate agent emoji
    await this.sendWaitingMessage(conversation, agentToUse);

    // Get the appropriate agent
    const agent = this.getAgentForContext(agentToUse);

    // Process conversation history
    const agentMessages = await this.processConversationHistory(
      conversation,
      conversationHistory
    );

    // Create initial state for agent
    const initialState = this.createInitialAgentState(
      userInboxId,
      messageContent,
      userProfile,
      agentMessages
    );

    // Invoke the agent
    const finalState = await agent.invoke(initialState);

    console.log({ initialState, finalState });

    // Check if funding requirements exist before sending agent response
    const fundingData =
      this.userStateManager.getFundingRequirement(userInboxId);

    // Only send agent response if no funding requirements (funding menu takes priority)
    if (!fundingData) {
      await this.sendAgentResponse(conversation, finalState);
    }

    // Handle post-processing (funding, profile menus, quick replies)
    await this.handlePostProcessing(
      conversation,
      userInboxId,
      userProfile,
      finalState
    );
  }

  private async sendWaitingMessage(
    conversation: Conversation,
    agentToUse: UserContextType
  ): Promise<void> {
    const agentEmoji =
      {
        shopping: AGENT_EMOJIS.SHOPPING,
        profile: AGENT_EMOJIS.PROFILE,
        menu: AGENT_EMOJIS.SHOPPING,
      }[agentToUse] || AGENT_EMOJIS.SHOPPING;

    await conversation.send(`${agentEmoji} is ${WAITING_MESSAGE}`);
    await conversation.sync();
  }

  private getAgentForContext(context: UserContextType) {
    const config = this.getAgentConfig();

    switch (context) {
      case "shopping":
      case "general":
      case "menu":
        return createShoppingAgent(config);
      case "profile":
        return createProfileAgent(config.llm);
      default:
        return createShoppingAgent(config);
    }
  }

  private getAgentConfig(): AgentConfig {
    return {
      llm: this.llm,
      currentFundingRequirement:
        this.userStateManager.getAllFundingRequirements(),
      wrapOrderProductTool: () => this.orderToolWrapper.wrapOrderProductTool(),
    };
  }

  private async processConversationHistory(
    conversation: Conversation,
    conversationHistory?: DecodedMessage[]
  ): Promise<Array<{ content: string; role: string }>> {
    // Get conversation history if not provided
    if (!conversationHistory) {
      conversationHistory = await conversation.messages();
    }

    const agentInboxId = this.xmtpClient.inboxId;

    // Get the user's inbox ID to check for context clear timestamp
    const userInboxId = conversationHistory.find(
      (msg) => msg.senderInboxId !== agentInboxId
    )?.senderInboxId;
    const clearTimestamp = userInboxId
      ? this.userStateManager.getContextClearTimestamp(userInboxId)
      : undefined;

    return conversationHistory
      .filter(
        (msg) =>
          !(
            msg.senderInboxId === agentInboxId &&
            String(msg.content).includes(WAITING_MESSAGE)
          )
      )
      .filter((msg) => msg.contentType?.typeId === "text")
      .filter((msg) => {
        // If context was cleared, only include messages after clear timestamp
        if (clearTimestamp) {
          // Try common timestamp property names used in XMTP messages (same as toShowMenu.ts)
          const msgWithTimestamp = msg as unknown as {
            sentAt?: string | Date;
            sent?: string | Date;
            timestamp?: string | Date;
            createdAt?: string | Date;
          };
          const messageTime =
            msgWithTimestamp.sentAt ||
            msgWithTimestamp.sent ||
            msgWithTimestamp.timestamp ||
            msgWithTimestamp.createdAt;
          if (messageTime) {
            const msgDate = new Date(messageTime);
            return msgDate > clearTimestamp;
          }
        }
        return true;
      })
      .map((msg) => {
        const content = String(msg.content);
        let cleanContent = content;

        // Remove agent emojis from the beginning of messages
        Object.values(AGENT_EMOJIS).forEach((emoji) => {
          if (cleanContent.startsWith(`${emoji} `)) {
            cleanContent = cleanContent.substring(emoji.length + 1);
          }
        });

        return {
          content: cleanContent,
          role: msg.senderInboxId === agentInboxId ? "assistant" : "user",
        };
      })
      .slice(-20); // Keep last 20 messages
  }

  private createInitialAgentState(
    userInboxId: string,
    messageContent: string,
    userProfile: UserProfile | null,
    agentMessages: Array<{ content: string; role: string }>
  ): AgentState {
    return {
      messages: agentMessages,
      userInboxId,
      lastMessage: messageContent,
      userProfile,
      fundingData: this.userStateManager.getFundingRequirement(userInboxId),
      quickReplies: [],
    };
  }

  private async sendAgentResponse(
    conversation: Conversation,
    finalState: AgentState
  ): Promise<void> {
    const lastMessage = finalState.messages[finalState.messages.length - 1];

    if (lastMessage) {
      await conversation.send(lastMessage.content);
      await conversation.sync();
    } else {
      await conversation.send(
        "❌ Sorry, I couldn't generate a response. Please try again."
      );
    }
  }

  private async handlePostProcessing(
    conversation: Conversation,
    userInboxId: string,
    userProfile: UserProfile | null,
    finalState: AgentState
  ): Promise<void> {
    // Handle funding requirements
    await this.handleFundingRequirements(
      conversation,
      userInboxId,
      userProfile,
      finalState
    );

    // Handle profile menu requirements
    await this.handleProfileMenuRequirements(conversation, userInboxId);

    // Handle quick replies
    await this.handleQuickReplies(conversation, finalState);

    // Handle quick buy products
    await this.handleQuickBuy(conversation, finalState);
  }

  private async handleFundingRequirements(
    conversation: Conversation,
    userInboxId: string,
    userProfile: UserProfile | null,
    finalState: AgentState
  ): Promise<void> {
    const fundingData =
      this.userStateManager.getFundingRequirement(userInboxId);

    if (
      fundingData &&
      userProfile?.hostWalletAddress &&
      finalState.userProfile?.walletAddress
    ) {
      await this.actionMenuFactory.sendFundingActionMenu(
        conversation,
        fundingData
      );
    }
  }

  private async handleProfileMenuRequirements(
    conversation: Conversation,
    userInboxId: string
  ): Promise<void> {
    if (this.userStateManager.getNeedsProfileMenu(userInboxId)) {
      await this.actionMenuFactory.sendProfileActionMenu(
        conversation,
        userInboxId
      );
      this.userStateManager.clearProfileMenuFlag(userInboxId);
    }
  }

  private async handleQuickReplies(
    conversation: Conversation,
    finalState: AgentState
  ): Promise<void> {
    const quickReplies = finalState.quickReplies;
    if (quickReplies && quickReplies.length > 0) {
      await this.actionMenuFactory.sendQuickRepliesMenu(
        conversation,
        quickReplies
      );
    }
  }

  private async handleQuickBuy(
    conversation: Conversation,
    finalState: AgentState
  ): Promise<void> {
    const quickBuy = finalState.quickBuy;
    if (quickBuy && quickBuy.length > 0) {
      await this.actionMenuFactory.sendQuickBuyMenu(
        conversation,
        finalState.userInboxId,
        quickBuy
      );
    }
  }
}
