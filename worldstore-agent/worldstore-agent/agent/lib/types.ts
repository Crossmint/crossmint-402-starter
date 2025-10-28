import { z } from "zod";
import { validateEnvironment } from "@helpers/client";
import { ChatAnthropic } from "@langchain/anthropic";
import { DynamicStructuredTool } from "@langchain/core/tools";

const { WORLDSTORE_API_URL } = validateEnvironment(["WORLDSTORE_API_URL"]);

export type FundingData = {
  shortfall: string;
  current: string;
  required: string;
  asin: string;
  hostWalletAddress: string;
  hostWalletBalance: string;
};

export interface AgentConfig {
  llm: ChatAnthropic;
  currentFundingRequirement: { [inboxId: string]: FundingData };
  wrapOrderProductTool: () => DynamicStructuredTool;
}

// Agent emoji prefixes for response identification
export const AGENT_EMOJIS = {
  SHOPPING: "🧙‍♀️",
  GENERAL: "🤖",
  PROFILE: "👤",
  WALLET: "💰",
} as const;

export interface UserProfile {
  inboxId: string;
  name: string;
  email: string;
  shippingAddress: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  walletAddress?: string;
  hostWalletAddress: string;
  isComplete: boolean;
  orderHistory: Array<Order>;
}

export type Order = {
  asin: string;
  orderId: string;
  orderDate: string;
};

export interface AgentState {
  messages: Array<{ role: string; content: string }>;
  userInboxId: string;
  userProfile?: UserProfile | null;
  lastMessage: string;
  fundingData?: FundingData;
  quickReplies?: Array<{ label: string; value: string }>;
  quickBuy?: Array<{ asin: string; title: string }>;
}

// non-null version of AgentState
export type CompleteProfileAgentState = AgentState & {
  userProfile: NonNullable<AgentState["userProfile"]> & {
    isComplete: true;
    name: string;
    email: string;
    shippingAddress: NonNullable<AgentState["userProfile"]>["shippingAddress"];
  };
};

export const profileToolSchema = z.object({
  userInboxId: z
    .string()
    .describe("The inbox ID of the user to edit the profile for"),
  name: z
    .string()
    .optional()
    .describe("The name of the user to edit the profile for"),
  email: z
    .string()
    .optional()
    .describe("The email address of the user to edit the profile for"),
  shippingAddress: z
    .object({
      line1: z.string().describe("Street address line 1"),
      line2: z.string().describe("Street address line 2 (apt, suite, etc.)"),
      city: z.string().describe("City name"),
      state: z.string().describe("State abbreviation"),
      postalCode: z.string().describe("ZIP/postal code"),
      country: z.string().describe("2-letter ISO country code (e.g., 'US')"),
    })
    .optional()
    .describe(
      "Structured shipping address - ALL address input must be parsed into this format"
    ),
});

export const orderProductToolSchema = z.object({
  userInboxId: z
    .string()
    .describe("The inbox ID of the user placing the order"),
  asin: z
    .string()
    .min(10)
    .max(10)
    .describe("Amazon ASIN (10-character alphanumeric product identifier)"),
  orderServerUrl: z
    .string()
    .optional()
    .default(WORLDSTORE_API_URL)
    .describe("Base URL of the order server (defaults to Crossmint API)"),
});

export const readProfileToolSchema = z.object({
  userInboxId: z
    .string()
    .describe("The inbox ID of the user whose profile to read"),
});

export const searchProductToolSchema = z.object({
  query: z.string().describe("The query to search for"),
});

export const orderStatusToolSchema = z.object({
  orderId: z.string().describe("The order ID to check status for"),
});

export class InsufficientFundsError extends Error {
  constructor(
    // eslint-disable-next-line no-unused-vars
    public readonly fundingData: FundingData
  ) {
    super("Insufficient funds for transaction");
    this.name = "InsufficientFundsError";
  }
}

export class ProfileNotFoundError extends Error {
  constructor(message = "Profile not found or incomplete") {
    super(message);
    this.name = "ProfileNotFoundError";
  }
}
