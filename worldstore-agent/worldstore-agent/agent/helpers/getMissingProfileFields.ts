import { UserProfile } from "lib/types";

export const getMissingProfileFields = (profile: UserProfile): string[] => {
  const missing: string[] = [];
  if (!profile.name) missing.push("name");
  if (!profile.email) missing.push("email");
  if (
    !profile.shippingAddress?.line1 ||
    !profile.shippingAddress?.city ||
    !profile.shippingAddress?.state ||
    !profile.shippingAddress?.postalCode
  ) {
    missing.push("shipping address");
  }
  return missing;
};
