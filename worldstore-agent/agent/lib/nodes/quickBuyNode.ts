import { ChatAnthropic } from "@langchain/anthropic";
import { logger } from "@helpers/logger";
import { AgentState } from "@lib/types";

interface DetectedProduct {
  asin: string;
  title: string;
}

interface ProductDetectionResult {
  hasProducts: boolean;
  products: DetectedProduct[];
}

export const createQuickBuyNode = (llm: ChatAnthropic) => {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    logger.agent("🛒 Quick buy node processing", {
      userInboxId: state.userInboxId,
      messageCount: state.messages.length,
    });

    try {
      // Get the last assistant message to analyze for product data
      const lastAssistantMessage = [...state.messages]
        .reverse()
        .find((msg) => msg.role === "assistant");

      if (!lastAssistantMessage) {
        return { quickBuy: [] };
      }

      const content = lastAssistantMessage.content as string;

      // Use LLM to intelligently detect if there are buyable products in the message
      const detectionPrompt = `Analyze the following assistant response and determine if it contains Amazon products that can be purchased.

Look for:
- Product listings with ASINs (10-character Amazon product identifiers)
- Search results from Amazon
- Product recommendations
- Shopping agent responses with product data

Assistant response to analyze:
${content}

Return ONLY a JSON object with this exact format:
{
  "hasProducts": true/false,
  "products": [
    {
      "asin": "B078GDLCT5",
      "title": "Product Name Here"
    }
  ]
}

If no buyable products are found, return:
{
  "hasProducts": false,
  "products": []
}`;

      const response = await llm.invoke([
        { role: "user", content: detectionPrompt },
      ]);

      const responseContent = response.content as string;

      try {
        // Extract JSON from the response
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          logger.agent("No JSON found in LLM response", {
            userInboxId: state.userInboxId,
            responsePreview: responseContent.substring(0, 200),
          });
          return { quickBuy: [] };
        }

        const detectionResult = JSON.parse(
          jsonMatch[0]
        ) as ProductDetectionResult;

        if (
          !detectionResult.hasProducts ||
          !Array.isArray(detectionResult.products)
        ) {
          logger.agent("No products detected by LLM", {
            userInboxId: state.userInboxId,
            hasProducts: detectionResult.hasProducts,
          });
          return { quickBuy: [] };
        }

        // Create quick buy products from detected products
        const quickBuyProducts = detectionResult.products
          .filter(
            (product: DetectedProduct) =>
              product.asin &&
              product.title &&
              typeof product.asin === "string" &&
              product.asin.length === 10
          )
          .slice(0, 4) // Limit to 4 options
          .map((product: DetectedProduct) => ({
            asin: String(product.asin),
            title: String(product.title),
          }));

        logger.agent("Generated quick buy products via LLM", {
          userInboxId: state.userInboxId,
          productCount: quickBuyProducts.length,
          products: quickBuyProducts.map((product) => ({
            asin: product.asin,
            title: product.title.substring(0, 50),
          })),
        });

        return {
          quickBuy: quickBuyProducts,
        };
      } catch (parseError) {
        logger.error("Failed to parse LLM detection response", {
          error:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
          userInboxId: state.userInboxId,
          responseContent: responseContent.substring(0, 300),
        });
        return { quickBuy: [] };
      }
    } catch (error) {
      logger.error("Quick buy generation error", {
        error: error instanceof Error ? error.message : String(error),
        userInboxId: state.userInboxId,
      });

      return { quickBuy: [] };
    }
  };
};
