import { logger } from "@helpers/logger";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { orderStatusToolSchema, readProfileToolSchema } from "../types";
import { loadUserOrders } from "@helpers/loadUserOrders";
import { loadUserProfile } from "@helpers/loadUserProfile";
import {
  InsufficientFundsError,
  ProfileNotFoundError,
  orderProductToolSchema,
  searchProductToolSchema,
} from "../types";
import { saveUserOrderId } from "@helpers/saveUserOrderId";
import { getJson } from "serpapi";
import { validateEnvironment } from "@helpers/client";
import { processPayment, type OrderData } from "@helpers/payment";

// @ts-ignore - Using Node.js 18+ global fetch
declare const fetch: any;

const { WORLDSTORE_API_URL, SERPAPI_API_KEY } = validateEnvironment([
  "WORLDSTORE_API_URL",
  "SERPAPI_API_KEY",
]);

export const orderProductTool = (): any => {
  return new DynamicStructuredTool({
    name: "order_product",
    description: `Order Amazon products for users with complete profiles. Use this tool for purchase requests and standalone ASINs.

🎯 WHEN TO USE THIS TOOL:
- User sends JUST an ASIN: "B078GDLCT5" (This means they want to buy it!)
- User says "I want to buy [ASIN]"
- User says "Purchase [ASIN] for me"
- User says "Order [ASIN]"
- Any valid 10-character Amazon ASIN with purchase intent

🚫 WHEN NOT TO USE:
- Profile is incomplete (missing name, email, or address)
- User is asking about products without purchase intent
- User is updating profile information
- No valid ASIN in the request

✅ ASIN RECOGNITION:
- Exactly 10 characters long
- Numeric: "1953953557" or Alphanumeric: "B08N5WRWNW"
- Standalone ASIN = Purchase request (user wants to buy it)
- Examples: "B078GDLCT5", "1953953557", "B08N5WRWNW"

🔥 CRITICAL: If user sends a standalone ASIN like "B078GDLCT5", they want to purchase it - use this tool!

WHAT THIS TOOL DOES:
- Validates user profile is complete
- Creates Amazon order via Crossmint API
- Processes USDC payment on Base network
- Returns order confirmation or error messages

CRITICAL: Only call when user explicitly requests to purchase a specific ASIN.`,
    schema: orderProductToolSchema,
    func: async ({
      userInboxId,
      asin,
    }: z.infer<typeof orderProductToolSchema>) => {
      const orderServerUrl = WORLDSTORE_API_URL;
      try {
        logger.tool("order_product", "Starting order process", {
          userInboxId,
          asin,
        });

        // Load user profile
        const userProfile = await loadUserProfile(userInboxId);
        if (!userProfile || !userProfile.isComplete) {
          throw new ProfileNotFoundError(
            "Your profile must be complete before ordering. Please provide your name, email, and shipping address first."
          );
        }

        if (
          !userProfile.email ||
          !userProfile.shippingAddress ||
          !userProfile.name
        ) {
          throw new ProfileNotFoundError(
            "Missing required profile information. Please complete your profile with email and shipping address."
          );
        }

        // Use structured shipping address directly
        const physicalAddress = {
          name: userProfile.name,
          line1: userProfile.shippingAddress.line1,
          line2: userProfile.shippingAddress.line2,
          city: userProfile.shippingAddress.city,
          state: userProfile.shippingAddress.state,
          postalCode: userProfile.shippingAddress.postalCode,
          country: userProfile.shippingAddress.country,
        };

        const orderData: OrderData = {
          productLocator: `amazon:${asin}`,
          email: userProfile.email,
          physicalAddress,
          payment: {
            method: "base-sepolia", // Default chain
            currency: "USDC",
          },
        };

        logger.tool("order_product", "Starting payment processing", {
          orderData,
        });

        // Process complete payment flow using utility function
        const paymentResult = await processPayment({
          orderData,
          orderServerUrl,
          userProfile,
        });

        if (!paymentResult.success) {
          logger.error("Payment processing failed", {
            error: paymentResult.error,
          });
          return `❌ Payment processing failed: ${paymentResult.error}`;
        }

        const response = paymentResult.response;

        // Return formatted string response instead of raw JSON to prevent LLM confusion
        logger.success("Order created successfully", { response });
        await saveUserOrderId({
          profile: userProfile,
          order: {
            asin,
            orderId: response.order.orderId,
            orderDate: new Date().toISOString(),
          },
        });
        return `🎉 Order placed successfully!\n\nOrder Details:\n- ASIN: ${asin}\n- Order ID: ${response.order.orderId || "N/A"}\n- Status: ${response.status || "Processing"}\n- Total: ${response.total || "N/A"}\n\nYour order will be shipped to:\n${userProfile.name}\n${userProfile.shippingAddress.line1}, ${userProfile.shippingAddress.city}, ${userProfile.shippingAddress.state} ${userProfile.shippingAddress.postalCode}\n\nYou should receive a confirmation email (if not received already) at: ${userProfile.email}. Here's your order id, make sure to keep it safe: ${response.order.orderId}`;
      } catch (error) {
        if (error instanceof InsufficientFundsError) {
          throw error;
        }
        logger.error("Error processing order", error);
        return "❌ Sorry, there was an error processing your order. Please try again.";
      }
    },
  });
};
export const searchProductTool = (): any => {
  return new DynamicStructuredTool({
    name: "search_product",
    description: `Search for products on Amazon.com. Use this tool to search for products on Amazon.com.
    IMPORTANT: Always return the "url" separately as a text string along with all other product details.`,
    schema: searchProductToolSchema,
    func: async ({ query }: z.infer<typeof searchProductToolSchema>) => {
      const response = await getJson({
        engine: "amazon",
        k: query,
        amazon_domain: "amazon.com",
        api_key: SERPAPI_API_KEY,
      });
      const items = response.organic_results
        .map(
          ({
            asin,
            title,
            link_clean,
            rating,
            reviews,
            extracted_price,
            thumbnail,
          }: {
            asin: string;
            title: string;
            link_clean: string;
            rating: number;
            reviews: number;
            extracted_price: number;
            thumbnail: string;
          }) => {
            return {
              asin,
              title,
              url: link_clean,
              rating,
              reviews,
              extracted_price,
              thumbnail,
            };
          }
        )
        // .sort(() => Math.random() - 0.5) // shuffle
        .slice(0, 3);
      return JSON.stringify(items);
    },
  });
};
export const getUserOrderHistoryTool = (): any => {
  return new DynamicStructuredTool({
    name: "get_user_order_history",
    description: `Get the user's complete order history.

Use this tool to:
- Show all past orders for the user
- Display order details including ASIN, order ID, and date
- Help users track their purchase history
- Provide order information for support inquiries

This tool reads the actual order history from storage and formats it for display.`,
    schema: readProfileToolSchema,
    func: async ({ userInboxId }: z.infer<typeof readProfileToolSchema>) => {
      try {
        const orderHistory = await loadUserOrders(userInboxId);

        if (!orderHistory || orderHistory.length === 0) {
          return `📦 Order History

No orders found for this user.

Status: No previous purchases
Next step: Use search_product to find items to purchase, then use order_product to place orders.`;
        }

        // Sort orders by date (newest first)
        const sortedOrders = orderHistory.sort(
          (a, b) =>
            new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()
        );

        let historyText = `📦 Order History (${orderHistory.length} order${orderHistory.length === 1 ? "" : "s"})\n\n`;

        sortedOrders.forEach((order, index) => {
          const orderDate = new Date(order.orderDate).toLocaleDateString(
            "en-US",
            {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }
          );

          historyText += `${index + 1}. Order #${order.orderId}\n`;
          historyText += `   📅 Date: ${orderDate}\n`;
          historyText += `   🛍️ ASIN: ${order.asin}\n`;
          historyText += `   🔗 Amazon: https://amazon.com/dp/${order.asin}\n\n`;
        });

        logger.success("Order history retrieved successfully", {
          userInboxId,
          orderCount: orderHistory.length,
        });

        return historyText.trim();
      } catch (error) {
        logger.error("Error loading order history", error);
        return "❌ Error loading order history. Please try again.";
      }
    },
  });
};
export const getOrderStatusTool = (): any => {
  return new DynamicStructuredTool({
    name: "get_order_status",
    description: `Check the status of a specific order using its order ID.

Use this tool to:
- Check the current status of an order
- Get detailed order information
- Track shipping status
- Verify order completion

Provide the order ID that was returned when the order was placed.`,
    schema: orderStatusToolSchema,
    func: async ({ orderId }: z.infer<typeof orderStatusToolSchema>) => {
      try {
        logger.tool("get_order_status", "Checking order status", { orderId });

        const statusUrl = `${WORLDSTORE_API_URL}/api/orders/${orderId}/status`;

        logger.tool("get_order_status", "Making GET request", { statusUrl });

        const response = await fetch(statusUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            logger.warn("Order not found", {
              orderId,
              status: response.status,
            });
            return `❌ Order not found. Order ID "${orderId}" does not exist or may be invalid.`;
          }

          logger.error("Order status request failed", {
            orderId,
            status: response.status,
            statusText: response.statusText,
          });
          return `❌ Failed to check order status. Status: ${response.status} ${response.statusText}`;
        }

        const orderData = await response.json();
        logger.success("Order status formatted successfully", { orderId });
        return orderData;
      } catch (error) {
        logger.error("Error checking order status", { orderId, error });
        return `❌ Error checking order status for order #${orderId}. Please try again or contact support.`;
      }
    },
  });
};

export const fetchAmazonAsinTool = (): any => {
  return new DynamicStructuredTool({
    name: "fetch_amazon_asin",
    description: `Extract Amazon product ASIN from Amazon short URLs (e.g., https://a.co/d/2TNBsOY).

Use this tool to:
- Convert Amazon short URLs to ASINs
- Get product identifiers from shareable Amazon links
- Extract ASINs from redirected Amazon URLs

Provide the Amazon short URL and get back the 10-character ASIN (e.g., B0F83JXHRD).`,
    schema: z.object({
      shortUrl: z.string().describe("The Amazon short URL to extract ASIN from"),
    }),
    func: async ({ shortUrl }: { shortUrl: string }) => {
      try {
        logger.tool("fetch_amazon_asin", "Starting ASIN extraction", { shortUrl });

        const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
        let finalUrl = "";
        let asin = "";

        // Try HEAD request first (faster), but fallback to GET if it fails
        let response;
        try {
          response = await fetch(shortUrl, {
            method: "HEAD",
            redirect: "follow",
            headers: { "User-Agent": userAgent }
          });
          
          // Check if HEAD request actually worked (some URLs return 404 for HEAD but work for GET)
          if (response.status >= 400) {
            throw new Error(`HEAD request returned ${response.status}`);
          }
          
          finalUrl = response.url;
          logger.tool("fetch_amazon_asin", "HEAD request successful", { finalUrl });
        } catch (error) {
          // If HEAD fails, try GET request
          logger.tool("fetch_amazon_asin", "HEAD failed, trying GET", { error: error.message });
          response = await fetch(shortUrl, {
            method: "GET",
            redirect: "follow",
            headers: { "User-Agent": userAgent }
          });
          
          if (response.status >= 400) {
            throw new Error(`GET request failed with status ${response.status}: ${response.statusText}`);
          }
          
          finalUrl = response.url;
          logger.tool("fetch_amazon_asin", "GET request successful", { finalUrl });
        }

        // Extract ASIN from the final URL
        // Amazon URLs typically have ASINs in these patterns:
        // - /dp/ASIN
        // - /gp/product/ASIN
        // - /product/ASIN
        let asinMatch = finalUrl.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i);
        
        if (!asinMatch && finalUrl.includes('amazon.com')) {
          // If direct URL extraction fails, try to get the page content and extract from there
          logger.tool("fetch_amazon_asin", "No ASIN in URL, checking page content", { finalUrl });
          try {
            const response = await fetch(finalUrl, {
              method: "GET",
              headers: { "User-Agent": userAgent }
            });
            const html = await response.text();
            
            // Look for ASIN in various places in the HTML
            asinMatch = html.match(/(?:data-asin|"asin"|'asin')["']?\s*[:=]\s*["']?([A-Z0-9]{10})["']?/i) ||
                       html.match(/href=["']\/dp\/([A-Z0-9]{10})/i) ||
                       html.match(/\/gp\/product\/([A-Z0-9]{10})/i);
          } catch (error) {
            logger.error("Failed to fetch page content", { error: error.message });
          }
        }
        
        if (!asinMatch) {
          logger.error("No ASIN found", { shortUrl, finalUrl });
          return `❌ Could not extract ASIN from URL. The URL may not be a valid Amazon product link.`;
        }

        asin = asinMatch[1];
        logger.success("ASIN extracted successfully", { shortUrl, finalUrl, asin });
        
        return `✅ ASIN extracted successfully: ${asin}

Original short URL: ${shortUrl}
Full Amazon URL: ${finalUrl}
Product ASIN: ${asin}

You can now use this ASIN to search for or order the product.`;
      } catch (error) {
        logger.error("Error extracting ASIN", { shortUrl, error });
        return `❌ Error extracting ASIN from URL: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
  });
};
