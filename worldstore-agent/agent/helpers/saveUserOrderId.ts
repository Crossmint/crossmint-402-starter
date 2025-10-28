import { Order, UserProfile } from "../lib/types";
import { saveUserOrderId as redisSaveUserOrderId } from "services/redis";

export const saveUserOrderId = async ({
  profile,
  order,
}: {
  profile: UserProfile;
  order: Order;
}): Promise<void> => {
  return redisSaveUserOrderId({ profile, order });
};
