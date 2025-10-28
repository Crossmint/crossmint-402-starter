import { setTimeout } from "timers";

/**
 * Utility function to delay execution to prevent message order discrepancies
 * @param ms - Delay in milliseconds (default: 1500ms for non-agent messages)
 */
export const delay = (ms = 1500): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Delays a conversation send to ensure proper message ordering
 * @param conversation - XMTP conversation instance
 * @param message - Message content to send
 * @param contentType - Optional content type
 * @param delayMs - Delay in milliseconds (default: 1500ms)
 */
export const delayedSend = async (
  conversation: any,
  message: any,
  contentType?: any,
  delayMs = 900 // Default delay of 900ms
): Promise<void> => {
  await delay(delayMs);
  if (contentType) {
    await conversation.send(message, contentType);
  } else {
    await conversation.send(message);
  }
};
