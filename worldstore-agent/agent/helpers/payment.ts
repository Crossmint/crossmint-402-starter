import { logger } from "@helpers/logger";
import { randomBytes } from "crypto";
import { USDCHandler } from "@helpers/usdc";
import { InsufficientFundsError, type UserProfile } from "@lib/types";
import { getWalletClientForUser } from "@helpers/getWalletClientForUser";

// @ts-ignore - Using Node.js 18+ global fetch
declare const fetch: any;

export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  maxAmountRequired: string;
  maxTimeoutSeconds?: number;
  extra?: {
    orderId?: string;
  };
}

export interface PaymentResult {
  success: boolean;
  response?: any;
  error?: string;
}

export interface OrderData {
  productLocator: string;
  email: string;
  physicalAddress: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  payment: {
    method: string;
    currency: string;
  };
}

export async function processPayment({
  orderData,
  orderServerUrl,
  userProfile,
}: {
  orderData: OrderData;
  orderServerUrl: string;
  userProfile: UserProfile;
}): Promise<PaymentResult> {
  try {
    // Extract ASIN from productLocator (format: "amazon:ASIN")
    const asin = orderData.productLocator.split(":")[1];

    logger.tool("processPayment", "Starting complete payment flow", {
      asin,
      orderData,
      orderServerUrl,
    });

    // Step 1: Initial request (should return 402 Payment Required)
    logger.tool("processPayment", "Making initial order request");
    const initialResponse = await fetch(`${orderServerUrl}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderData),
    });

    if (initialResponse.status === 402) {
      logger.tool(
        "processPayment",
        "Received 402, processing payment requirement"
      );

      // Get payment requirements from response
      const fullResponse = await initialResponse.json();
      const paymentRequirements: PaymentRequirements = fullResponse.accepts[0];

      logger.tool("processPayment", "Payment requirements received", {
        paymentRequirements,
      });

      const userWallet = getWalletClientForUser(userProfile.inboxId);

      const contractName = "USDC";
      const contractVersion = "2";

      const domain = {
        name: contractName,
        version: contractVersion,
        chainId: 84532,
        verifyingContract: paymentRequirements.asset as `0x${string}`,
      };

      // EIP-712 types for USDC transferWithAuthorization
      const types = {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      };

      const now = Math.floor(Date.now() / 1000);
      const nonce = `0x${randomBytes(32).toString("hex")}`;
      const authorization = {
        from: userWallet.account.address,
        to: paymentRequirements.payTo,
        value: BigInt(paymentRequirements.maxAmountRequired),
        validAfter: BigInt(0),
        validBefore: BigInt(
          now + (paymentRequirements.maxTimeoutSeconds || 3600)
        ),
        nonce,
      };

      // Check balance before signing data for transaction
      const usdcHandler = new USDCHandler("base-sepolia");
      const currentBalance = parseFloat(
        await usdcHandler.getUSDCBalance(userWallet.account.address)
      );
      const hostWalletBalance = parseFloat(
        await usdcHandler.getUSDCBalance(userProfile.hostWalletAddress)
      );
      const requiredAmount =
        parseInt(paymentRequirements.maxAmountRequired) / Math.pow(10, 6);

      if (currentBalance < requiredAmount) {
        const shortfall = Math.floor(
          (requiredAmount - currentBalance) * Math.pow(10, 6)
        ).toString();

        console.log({
          shortfall,
          recipientAddress: paymentRequirements.payTo,
          walletAddress: userWallet.account.address,
          current: currentBalance.toFixed(6),
          required: requiredAmount.toFixed(6),
          asin,
        });

        throw new InsufficientFundsError({
          shortfall,
          current: currentBalance.toFixed(6),
          required: requiredAmount.toFixed(6),
          asin,
          hostWalletAddress: userProfile.hostWalletAddress,
          hostWalletBalance: hostWalletBalance.toFixed(6),
        });
      }

      const signature = await userWallet.signTypedData({
        account: userWallet.account,
        domain,
        types,
        primaryType: "TransferWithAuthorization",
        message: authorization,
      });

      logger.tool("processPayment", "Signature created", { signature });

      const paymentPayload = {
        x402Version: 1,
        scheme: paymentRequirements.scheme,
        network: paymentRequirements.network,
        payload: {
          signature,
          authorization: {
            from: userWallet.account.address,
            to: paymentRequirements.payTo,
            value: BigInt(paymentRequirements.maxAmountRequired).toString(),
            validAfter: BigInt(0).toString(),
            validBefore: BigInt(
              now + (paymentRequirements.maxTimeoutSeconds || 3600)
            ).toString(),
            nonce,
          },
        },
        extra: {
          orderId: paymentRequirements.extra?.orderId,
        },
      };

      logger.tool("processPayment", "Payment payload created", {
        paymentPayload,
      });

      const encodedPayment = Buffer.from(
        JSON.stringify(paymentPayload)
      ).toString("base64");

      logger.tool("processPayment", "Payment encoded, making retry request");

      // Step 2: Retry with payment header
      const paymentResponse = await fetch(`${orderServerUrl}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": encodedPayment,
        },
        body: JSON.stringify(orderData),
      });

      const response = await paymentResponse.json();
      logger.tool("processPayment", "Payment response received", { response });

      if (paymentResponse.ok) {
        logger.tool("processPayment", "Payment successful", { response });
        return {
          success: true,
          response,
        };
      } else {
        logger.error("Payment request failed", {
          status: paymentResponse.status,
          response,
        });
        return {
          success: false,
          error: `Payment failed. Status: ${paymentResponse.status}`,
        };
      }
    } else if (initialResponse.ok) {
      // Unexpected success without payment (shouldn't happen with x402)
      const orderResult = await initialResponse.json();
      logger.warn("Order succeeded without payment requirement", {
        orderResult,
      });
      return {
        success: true,
        response: orderResult,
      };
    } else {
      const errorData = await initialResponse.text();
      logger.error("Initial order request failed", {
        status: initialResponse.status,
        errorData,
      });
      return {
        success: false,
        error: `Order failed. Status: ${initialResponse.status}`,
      };
    }
  } catch (error) {
    const asin = orderData.productLocator.split(":")[1];
    logger.error("Error in payment flow", { error, asin, orderData });

    if (error instanceof InsufficientFundsError) {
      throw error;
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown payment error",
    };
  }
}
