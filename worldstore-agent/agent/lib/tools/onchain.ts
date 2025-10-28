import { logger } from "@helpers/logger";
import { saveUserProfile } from "@helpers/saveUserProfile";
import { getOnChainTools } from "@goat-sdk/adapter-langchain";
import { viem } from "@goat-sdk/wallet-viem";
import { UserProfile } from "@lib/types";
import { getWalletClientForUser } from "@helpers/getWalletClientForUser";

export const getUserOnchainTools = async (
  userProfile: UserProfile
): Promise<any[]> => {
  logger.tool("getUserOnchainTools", "Initializing GOAT tools for user", {
    userInboxId: userProfile.inboxId,
  });

  try {
    // Generate deterministic wallet for this user
    const userWallet = getWalletClientForUser(userProfile.inboxId);

    logger.tool("getUserOnchainTools", "Created deterministic wallet", {
      walletAddress: userWallet.account.address,
    });

    if (!userProfile.walletAddress) {
      userProfile.walletAddress = userWallet.account.address;
      await saveUserProfile(userProfile);
      logger.profile("Updated profile with wallet address", {
        userInboxId: userProfile.inboxId,
        walletAddress: userProfile.walletAddress,
      });
    }

    // Create GOAT tools with the deterministic wallet
    const tools = await getOnChainTools({
      wallet: viem(userWallet),
    });

    logger.tool("getUserOnchainTools", "Initialized GOAT tools", {
      userInboxId: userProfile.inboxId,
      toolCount: tools.length,
    });
    return tools;
  } catch (error) {
    logger.error("getUserOnchainTools: Error initializing GOAT tools", error);
    logger.warn("Falling back to empty tools array");
    return [];
  }
};
