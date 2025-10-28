import { UserProfile } from "@lib/types";
import { getUserOnchainTools } from "./onchain";
import { editProfileTool, readProfileTool, deleteProfileTool, getWalletAddressesTool } from "./profile";
import { searchProductTool, fetchAmazonAsinTool } from "./order";
import { getOrderStatusTool, getUserOrderHistoryTool } from "./order";

export const getTools = async (userProfile: UserProfile | null | undefined) => {
  const walletTools = userProfile ? await getUserOnchainTools(userProfile) : [];
  const tools = [
    editProfileTool(),
    readProfileTool(),
    deleteProfileTool(),
    getWalletAddressesTool(),
    // orderProductTool(),
    searchProductTool(),
    fetchAmazonAsinTool(),
    getUserOrderHistoryTool(),
    getOrderStatusTool(),
    ...walletTools,
  ];
  return tools;
};
