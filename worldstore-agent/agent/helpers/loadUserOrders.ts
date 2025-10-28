import { UserProfile } from "lib/types";
import { loadUserOrders as redisLoadUserOrders } from "services/redis";

export const loadUserOrders = async (
  inboxId: string
): Promise<UserProfile["orderHistory"]> => {
  return redisLoadUserOrders(inboxId);
};
