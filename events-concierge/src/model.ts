import { createOpenAI } from "@ai-sdk/openai";

// Model is created with API key from environment at runtime
export const createModel = (apiKey: string) => createOpenAI({ apiKey })("gpt-4-turbo");
