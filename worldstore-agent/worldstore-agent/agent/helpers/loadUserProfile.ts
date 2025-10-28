import { UserProfile } from "lib/types";
import { loadUserProfile as redisLoadUserProfile } from "services/redis";

export const loadUserProfile = async (
  inboxId: string
): Promise<UserProfile | null> => {
  return redisLoadUserProfile(inboxId);
};
