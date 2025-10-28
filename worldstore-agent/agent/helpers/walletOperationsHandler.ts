import { Conversation } from "@xmtp/node-sdk";
import { ContentTypeWalletSendCalls } from "@xmtp/content-type-wallet-send-calls";
import { USDCHandler } from "./usdc";
import { FundingData } from "../lib/types";
import { loadUserProfile } from "./loadUserProfile";
import { logger } from "./logger";

export class WalletOperationsHandler {
  private usdcHandler: USDCHandler;

  constructor() {
    this.usdcHandler = new USDCHandler("base-sepolia");
  }

  async sendActualFundingRequest({
    sender,
    receiver,
    fundingData,
    conversation,
  }: {
    sender: string;
    receiver: string;
    fundingData: FundingData;
    conversation: Conversation;
  }): Promise<void> {
    try {
      const walletCalls = this.usdcHandler.createUSDCTransferCalls(
        sender, // sender
        receiver, // receiver
        Number(fundingData.shortfall) // amount
      );

      await conversation.send("💸 Preparing funding request...");
      await conversation.send(walletCalls, ContentTypeWalletSendCalls);
      await conversation.sync();

      logger.info("Actual wallet funding request sent", {
        sender,
        receiver,
        amount: fundingData.shortfall,
      });
    } catch (error) {
      logger.error("Error in sendActualFundingRequest", error);
      await conversation.send(
        "❌ Error preparing funding request. Please try again."
      );
    }
  }

  async handleBalanceCheck(
    conversation: Conversation,
    userInboxId: string
  ): Promise<void> {
    try {
      const userProfile = await loadUserProfile(userInboxId);
      if (!userProfile?.walletAddress) {
        await conversation.send(
          "❌ No wallet address found. Please complete your profile first."
        );
        return;
      }

      await conversation.send(
        "🔍 Checking balances for both your wallet and host wallet..."
      );

      // Get balances for both user wallet and host wallet
      const [userUsdcBalance, userEthBalance, hostUsdcBalance, hostEthBalance] =
        await Promise.allSettled([
          this.usdcHandler.getUSDCBalance(userProfile.walletAddress),
          this.usdcHandler.getETHBalance(userProfile.walletAddress),
          this.usdcHandler.getUSDCBalance(userProfile.hostWalletAddress),
          this.usdcHandler.getETHBalance(userProfile.hostWalletAddress),
        ]);

      const userWalletPreview = `${userProfile.walletAddress.substring(0, 6)}...${userProfile.walletAddress.slice(-4)}`;
      const hostWalletPreview = `${userProfile.hostWalletAddress.substring(0, 6)}...${userProfile.hostWalletAddress.slice(-4)}`;

      // Calculate totals for summary
      let totalUsdc = 0;
      let totalEth = 0;
      let usdcErrors = 0;
      let ethErrors = 0;

      // Get user wallet balances
      let userUsdcAmount = 0;
      let userEthAmount = 0;
      if (userUsdcBalance.status === "fulfilled") {
        userUsdcAmount = parseFloat(userUsdcBalance.value);
        totalUsdc += userUsdcAmount;
      } else {
        usdcErrors++;
        logger.error("User USDC balance fetch error", {
          error: userUsdcBalance.reason,
          userInboxId,
        });
      }

      if (userEthBalance.status === "fulfilled") {
        userEthAmount = parseFloat(userEthBalance.value);
        totalEth += userEthAmount;
      } else {
        ethErrors++;
        logger.error("User ETH balance fetch error", {
          error: userEthBalance.reason,
          userInboxId,
        });
      }

      // Get host wallet balances
      let hostUsdcAmount = 0;
      let hostEthAmount = 0;
      if (hostUsdcBalance.status === "fulfilled") {
        hostUsdcAmount = parseFloat(hostUsdcBalance.value);
        totalUsdc += hostUsdcAmount;
      } else {
        usdcErrors++;
        logger.error("Host USDC balance fetch error", {
          error: hostUsdcBalance.reason,
          userInboxId,
        });
      }

      if (hostEthBalance.status === "fulfilled") {
        hostEthAmount = parseFloat(hostEthBalance.value);
        totalEth += hostEthAmount;
      } else {
        ethErrors++;
        logger.error("Host ETH balance fetch error", {
          error: hostEthBalance.reason,
          userInboxId,
        });
      }

      // Build the message with summary first
      let balanceMessage = `Balance Summary (Base Sepolia)\n`;
      
      if (usdcErrors === 0) {
        balanceMessage += `Total USDC: ${totalUsdc.toFixed(2)} USDC\n`;
      } else {
        balanceMessage += `Total USDC: Error fetching some balances\n`;
      }

      if (ethErrors === 0) {
        balanceMessage += `Total ETH: ${totalEth.toFixed(4)} ETH\n`;
      } else {
        balanceMessage += `Total ETH: Error fetching some balances\n`;
      }

      balanceMessage += `\nWallet Details\n\n`;

      // User Wallet Section
      balanceMessage += `Agent Wallet (${userWalletPreview})\n`;

      if (userUsdcBalance.status === "fulfilled") {
        balanceMessage += `USDC: ${userUsdcAmount.toFixed(2)}\n`;
      } else {
        balanceMessage += `USDC: Error fetching\n`;
      }

      if (userEthBalance.status === "fulfilled") {
        balanceMessage += `ETH: ${userEthAmount.toFixed(4)}\n`;
      } else {
        balanceMessage += `ETH: Error fetching\n`;
      }

      balanceMessage += `\n`;

      // Host Wallet Section  
      balanceMessage += `Your Coinbase Wallet (${hostWalletPreview})\n`;

      if (hostUsdcBalance.status === "fulfilled") {
        balanceMessage += `USDC: ${hostUsdcAmount.toFixed(2)}\n`;
      } else {
        balanceMessage += `USDC: Error fetching\n`;
      }

      if (hostEthBalance.status === "fulfilled") {
        balanceMessage += `ETH: ${hostEthAmount.toFixed(4)}\n`;
      } else {
        balanceMessage += `ETH: Error fetching\n`;
      }

      await conversation.send(balanceMessage);

      logger.info("Balance check completed", {
        userInboxId,
        userWalletAddress: userProfile.walletAddress,
        hostWalletAddress: userProfile.hostWalletAddress,
        userUsdcSuccess: userUsdcBalance.status === "fulfilled",
        userEthSuccess: userEthBalance.status === "fulfilled",
        hostUsdcSuccess: hostUsdcBalance.status === "fulfilled",
        hostEthSuccess: hostEthBalance.status === "fulfilled",
      });
    } catch (error) {
      logger.error("Error checking balance", { error, userInboxId });
      await conversation.send("❌ Error checking balance. Please try again.");
    }
  }
}
