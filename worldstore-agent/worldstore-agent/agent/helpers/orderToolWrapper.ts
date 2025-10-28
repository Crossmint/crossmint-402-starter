import { DynamicStructuredTool } from "@langchain/core/tools";
import { orderProductTool } from "../lib/tools/order";
import { InsufficientFundsError, ProfileNotFoundError } from "../lib/types";
import { UserStateManager } from "./userStateManager";
import { logger } from "./logger";
import z from "zod";

export class OrderToolWrapper {
  constructor(private userStateManager: UserStateManager) {}

  wrapOrderProductTool(): DynamicStructuredTool {
    const originalTool = orderProductTool();

    return new DynamicStructuredTool({
      name: originalTool.name,
      description: originalTool.description,
      schema: originalTool.schema,
      func: async ({
        userInboxId,
        asin,
      }: z.infer<typeof originalTool.schema>) => {
        try {
          logger.tool(
            "wrapped_order_product",
            "🔧 Calling original order product tool"
          );

          const result = await originalTool.func({
            userInboxId,
            asin,
          });

          // Clear funding requirement on successful order
          this.userStateManager.clearFundingRequirement(userInboxId);

          logger.tool(
            "wrapped_order_product",
            "✅ Order tool completed successfully"
          );

          return result;
        } catch (error) {
          return this.handleOrderError(error, userInboxId);
        }
      },
    });
  }

  private handleOrderError(error: unknown, userInboxId: string): string {
    if (error instanceof InsufficientFundsError) {
      // Store funding requirement for later handling
      this.userStateManager.setFundingRequirement(
        userInboxId,
        error.fundingData
      );

      logger.tool(
        "wrapped_order_product",
        "💰 Insufficient funds error handled"
      );

      // Return user-friendly message to LLM
      return `❌ Insufficient funds: You need ${error.fundingData.required} USDC but only have ${error.fundingData.current} USDC. Please add ${error.fundingData.shortfall} USDC to complete your order.`;
    }

    if (error instanceof ProfileNotFoundError) {
      // Flag that we need to show profile menu after LLM response
      this.userStateManager.setNeedsProfileMenu(userInboxId, true);

      logger.tool(
        "wrapped_order_product",
        "👤 Profile not found error handled"
      );

      // Return user-friendly message to LLM
      return error.message;
    }

    // Handle other errors
    logger.tool(
      "wrapped_order_product",
      "❌ Other error in order tool:",
      error instanceof Error ? error.message : String(error)
    );

    throw error; // Re-throw other errors
  }
}
