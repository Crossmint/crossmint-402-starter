import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { logger } from "@helpers/logger";
import {
  AgentState,
  UserProfile,
  FundingData,
  AgentConfig,
  AGENT_EMOJIS,
} from "@lib/types";
import { shoppingAssistantPrompt } from "@lib/agents/shopping/prompt";
import { createQuickBuyNode } from "../../nodes/quickBuyNode";
import { getTools } from "@lib/tools";

export const createShoppingAgent = (config: AgentConfig) => {
  const GraphState = Annotation.Root({
    messages: Annotation<any[]>({
      reducer: (x, y) => [...x, ...y],
      default: () => [],
    }),
    userInboxId: Annotation<string>({
      reducer: (x, y) => y ?? x,
      default: () => "",
    }),
    userProfile: Annotation<UserProfile | undefined>({
      reducer: (x, y) => y ?? x,
      default: () => undefined,
    }),
    lastMessage: Annotation<string>({
      reducer: (x, y) => y ?? x,
      default: () => "",
    }),
    fundingData: Annotation<FundingData | undefined>({
      reducer: (x, y) => y ?? x,
      default: () => undefined,
    }),
    quickReplies: Annotation<Array<{ label: string; value: string }>>({
      reducer: (x, y) => y ?? x,
      default: () => [],
    }),
    quickBuy: Annotation<Array<{ asin: string; title: string }>>({
      reducer: (x, y) => y ?? x,
      default: () => [],
    }),
  });

  const workflow = new StateGraph(GraphState);

  const shoppingNode = async (
    state: AgentState
  ): Promise<Partial<AgentState>> => {
    logger.agent("🎯 Shopping agent node processing", {
      userInboxId: state.userInboxId,
      lastMessage: state.lastMessage,
    });

    try {
      config.currentFundingRequirement[state.userInboxId] = undefined;
      logger.agent("🔄 Cleared funding requirement");

      // create shopping agent
      const agent = createReactAgent({
        llm: config.llm,
        tools: [
          ...(await getTools(state.userProfile)),
          config.wrapOrderProductTool(),
        ],
        messageModifier: shoppingAssistantPrompt(state),
      });

      // only for observability
      const callbacks = {
        handleLLMStart: (llm: any, prompts: string[]) => {
          logger.agent("🔍 LLM Start", {
            userInboxId: state.userInboxId,
            promptCount: prompts.length,
            promptPreview: prompts[0]?.substring(0, 300),
          });
        },
        handleLLMEnd: (output: any) => {
          const responseText =
            output.generations?.[0]?.[0]?.text ||
            output.text ||
            JSON.stringify(output);
          logger.agent("🔍 LLM End", {
            userInboxId: state.userInboxId,
            responsePreview: responseText?.substring(0, 300),
            hasToolCall:
              responseText?.includes("order_product") ||
              responseText?.includes("edit_profile") ||
              responseText?.includes("Action:"),
            toolMentioned: responseText?.includes("order_product")
              ? "order_product"
              : responseText?.includes("edit_profile")
                ? "edit_profile"
                : "none",
          });
        },
        handleLLMError: (error: any) => {
          logger.agent("🔍 LLM Error", {
            userInboxId: state.userInboxId,
            error: error instanceof Error ? error.message : String(error),
          });
        },
        handleText: (text: string, runId?: string) => {
          logger.agent("📝 Agent Text", {
            userInboxId: state.userInboxId,
            text: text?.substring(0, 200),
            isThought: text?.includes("Thought:"),
            isAction: text?.includes("Action:"),
            isObservation: text?.includes("Observation:"),
            runId: runId?.substring(0, 8),
          });
        },
        handleAgentAction: (action: any, runId?: string) => {
          logger.agent("🎯 Agent Action", {
            userInboxId: state.userInboxId,
            tool: action.tool,
            toolInput: action.toolInput,
            isOrderProduct: action.tool === "order_product",
            isEditProfile: action.tool === "edit_profile",
            extractedData:
              action.tool === "order_product"
                ? action.toolInput?.asin
                : action.tool === "edit_profile"
                  ? `${action.toolInput?.name || ""}|${action.toolInput?.email || ""}`
                  : "other",
            runId: runId?.substring(0, 8),
          });
        },
        handleToolStart: (tool: any, input: string, runId?: string) => {
          logger.agent("🔧 Tool Start", {
            userInboxId: state.userInboxId,
            toolName: tool.name,
            toolInput: input,
            runId: runId?.substring(0, 8),
          });
        },
        handleToolEnd: (output: any, runId?: string) => {
          const outputStr =
            typeof output === "string" ? output : JSON.stringify(output);
          logger.agent("🔧 Tool End", {
            userInboxId: state.userInboxId,
            outputPreview: outputStr?.substring(0, 200),
            success:
              !outputStr?.includes("error") && !outputStr?.includes("Error"),
            runId: runId?.substring(0, 8),
          });
        },
        handleToolError: (error: any, runId?: string) => {
          logger.agent("🔧 Tool Error", {
            userInboxId: state.userInboxId,
            error: error instanceof Error ? error.message : String(error),
            runId: runId?.substring(0, 8),
          });
        },
        handleAgentFinish: (finish: any, runId?: string) => {
          logger.agent("🏁 Agent Finish", {
            userInboxId: state.userInboxId,
            returnValues: finish.returnValues,
            finalResponse: finish.log?.substring(0, 200),
            runId: runId?.substring(0, 8),
          });
        },
      };

      const result = await agent.invoke(
        {
          messages: [
            ...state.messages,
            { role: "user", content: state.lastMessage },
          ],
        },
        {
          callbacks: [callbacks],
          configurable: {
            recursionLimit: 10,
          },
        }
      );

      const lastMessage = result.messages[result.messages.length - 1];
      const responseContent = `${AGENT_EMOJIS.SHOPPING} ${lastMessage.content as string}`;
      logger.agent(
        "📋 Current funding requirement:",
        config.currentFundingRequirement[state.userInboxId]
      );
      logger.agent("returning....", {
        messages: [
          ...state.messages,
          { role: "user", content: state.lastMessage },
          { role: "assistant", content: responseContent },
        ],
        userProfile: state.userProfile || undefined,
        fundingData: config.currentFundingRequirement[state.userInboxId],
      });

      return {
        messages: [
          ...state.messages,
          { role: "user", content: state.lastMessage },
          { role: "assistant", content: responseContent },
        ],
        userProfile: state.userProfile || undefined,
        fundingData: config.currentFundingRequirement[state.userInboxId],
      };
    } catch (error) {
      logger.error("🤖 Shopping agent error", {
        error: error instanceof Error ? error.message : String(error),
        userInboxId: state.userInboxId,
        lastMessage: state.lastMessage,
        fundingData: config.currentFundingRequirement[state.userInboxId],
      });

      return {
        messages: [
          ...state.messages,
          { role: "user", content: state.lastMessage },
          {
            role: "assistant",
            content: `${AGENT_EMOJIS.SHOPPING} ❌ Sorry, I encountered an error. Please try again.`,
          },
        ],
        userProfile: undefined,
        fundingData: config.currentFundingRequirement[state.userInboxId],
      };
    }
  };

  const quickBuyNode = createQuickBuyNode(config.llm);

  // Add nodes
  workflow.addNode("shopping", shoppingNode);
  workflow.addNode("quickBuyOptions", quickBuyNode);

  // Flow: START -> shopping -> quickBuy -> END
  (workflow as any).addEdge(START, "shopping");
  (workflow as any).addEdge("shopping", "quickBuyOptions");
  (workflow as any).addEdge("quickBuyOptions", END);
  return workflow.compile();
};
