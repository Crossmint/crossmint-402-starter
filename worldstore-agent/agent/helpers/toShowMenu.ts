import { WAITING_MESSAGE } from "./constants";

export type MenuType = "main" | "help" | "agents" | "clear" | null;

interface ConversationMessage {
  content: unknown;
  contentType?: { typeId: string };
  sentAt?: string | Date;
  sent?: string | Date;
  timestamp?: string | Date;
  createdAt?: string | Date;
}

export const getMenuType = (
  messageContent: string,
  conversationHistory: ConversationMessage[]
): MenuType => {
  const trimmedMessage = messageContent.trim().toLowerCase();

  // Check for specific slash commands
  if (trimmedMessage === "/help") {
    return "help";
  }

  if (trimmedMessage === "/agents" || trimmedMessage === "/agent") {
    return "agents";
  }

  if (trimmedMessage === "/menu") {
    return "main";
  }

  if (trimmedMessage === "/clear") {
    return "clear";
  }

  const meaningfulMessages = conversationHistory
    .filter((msg) => msg.content !== WAITING_MESSAGE)
    .filter((msg) => msg.contentType?.typeId === "text");

  const isFirstInteraction = meaningfulMessages.length <= 1;

  // Check if the time difference between the last two messages is more than 3 hours
  const isLongTimeSinceLastMessage =
    meaningfulMessages.length >= 2 &&
    (() => {
      const lastMessage = meaningfulMessages[meaningfulMessages.length - 1];
      const secondLastMessage =
        meaningfulMessages[meaningfulMessages.length - 2];

      // Try common timestamp property names used in XMTP messages
      const lastMessageTime =
        lastMessage.sentAt ||
        lastMessage.sent ||
        lastMessage.timestamp ||
        lastMessage.createdAt;
      const secondLastMessageTime =
        secondLastMessage.sentAt ||
        secondLastMessage.sent ||
        secondLastMessage.timestamp ||
        secondLastMessage.createdAt;

      if (lastMessageTime && secondLastMessageTime) {
        const timeDiff = Math.abs(
          new Date(lastMessageTime).getTime() -
            new Date(secondLastMessageTime).getTime()
        );
        const threeHoursInMs = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
        return timeDiff > threeHoursInMs;
      }

      return false;
    })();

  // Show main menu for first interaction or long time since last message
  if (isFirstInteraction || isLongTimeSinceLastMessage) {
    return "main";
  }

  return null;
};

// Backward compatibility function
export const toShowMenu = (
  messageContent: string,
  conversationHistory: ConversationMessage[]
): boolean => {
  return getMenuType(messageContent, conversationHistory) !== null;
};
