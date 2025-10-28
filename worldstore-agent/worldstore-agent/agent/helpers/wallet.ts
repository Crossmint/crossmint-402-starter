import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, WalletClient } from "viem";
import { baseSepolia } from "viem/chains";
import { validateEnvironment } from "@helpers/client";

const { RPC_PROVIDER_URL } = validateEnvironment(["RPC_PROVIDER_URL"]);

export const createUserWallet = (privateKey: `0x${string}`): WalletClient => {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC_PROVIDER_URL),
  });

  return walletClient;
};
