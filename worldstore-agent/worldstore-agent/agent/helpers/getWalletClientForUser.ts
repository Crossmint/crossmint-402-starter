import { generateUserPrivateKey } from "./generateUserPrivateKey";
import { createUserWallet } from "./wallet";
import { WalletClient } from "viem";

export const getWalletClientForUser = (inboxId: string): WalletClient => {
  const userPrivateKey = generateUserPrivateKey(inboxId);
  const userWallet = createUserWallet(userPrivateKey);

  return userWallet;
};
