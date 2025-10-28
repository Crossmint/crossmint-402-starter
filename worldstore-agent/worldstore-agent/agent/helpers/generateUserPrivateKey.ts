import { createHash } from "node:crypto";
import { validateEnvironment } from "@helpers/client";

const {
  WALLET_PRIVATE_KEY, // for user wallets
} = validateEnvironment(["WALLET_PRIVATE_KEY"]);
export const generateUserPrivateKey = (userInboxId: string): `0x${string}` => {
  // Create deterministic private key using bot's private key + user's inbox ID
  const combinedString = `${WALLET_PRIVATE_KEY}${userInboxId}`;
  const hash = createHash("sha256").update(combinedString).digest("hex");
  return `0x${hash}` as `0x${string}`;
};
