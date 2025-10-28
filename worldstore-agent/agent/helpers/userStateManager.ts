import { FundingData } from "../lib/types";

export type UserContextType = "shopping" | "general" | "profile" | "menu";

export class UserStateManager {
  private fundingRequirements = new Map<string, FundingData>();
  private profileMenuFlags = new Map<string, boolean>();
  private userContexts = new Map<string, UserContextType>();
  private contextClearTimestamps = new Map<string, Date>();

  // Funding requirement management
  setFundingRequirement(userInboxId: string, fundingData: FundingData): void {
    this.fundingRequirements.set(userInboxId, fundingData);
  }

  getFundingRequirement(userInboxId: string): FundingData | undefined {
    return this.fundingRequirements.get(userInboxId);
  }

  clearFundingRequirement(userInboxId: string): void {
    this.fundingRequirements.delete(userInboxId);
  }

  hasFundingRequirement(userInboxId: string): boolean {
    return this.fundingRequirements.has(userInboxId);
  }

  // Profile menu flag management
  setNeedsProfileMenu(userInboxId: string, needs: boolean): void {
    if (needs) {
      this.profileMenuFlags.set(userInboxId, true);
    } else {
      this.profileMenuFlags.delete(userInboxId);
    }
  }

  getNeedsProfileMenu(userInboxId: string): boolean {
    return this.profileMenuFlags.get(userInboxId) || false;
  }

  clearProfileMenuFlag(userInboxId: string): void {
    this.profileMenuFlags.delete(userInboxId);
  }

  // User context management
  setUserContext(userInboxId: string, context: UserContextType): void {
    this.userContexts.set(userInboxId, context);
  }

  getUserContext(userInboxId: string): UserContextType {
    return this.userContexts.get(userInboxId) || "general";
  }

  clearUserContext(userInboxId: string): void {
    this.userContexts.delete(userInboxId);
  }

  // Utility methods
  getAllFundingRequirements(): Record<string, FundingData> {
    return Object.fromEntries(this.fundingRequirements);
  }

  clearAllUserState(userInboxId: string): void {
    this.clearFundingRequirement(userInboxId);
    this.clearProfileMenuFlag(userInboxId);
    this.clearUserContext(userInboxId);
    this.contextClearTimestamps.set(userInboxId, new Date());
  }

  // Context clear timestamp management
  getContextClearTimestamp(userInboxId: string): Date | undefined {
    return this.contextClearTimestamps.get(userInboxId);
  }

  clearContextClearTimestamp(userInboxId: string): void {
    this.contextClearTimestamps.delete(userInboxId);
  }

  // For debugging/monitoring
  getUserStateSnapshot(userInboxId: string): {
    context: UserContextType;
    hasFunding: boolean;
    needsProfile: boolean;
  } {
    return {
      context: this.getUserContext(userInboxId),
      hasFunding: this.hasFundingRequirement(userInboxId),
      needsProfile: this.getNeedsProfileMenu(userInboxId),
    };
  }
}
