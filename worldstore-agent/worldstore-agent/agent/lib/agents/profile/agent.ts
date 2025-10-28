import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";
import { logger } from "@helpers/logger";
import { AgentState, UserProfile, FundingData, AGENT_EMOJIS } from "@lib/types";
import { getTools } from "@lib/tools";
// import { createQuickRepliesNode } from "@lib/nodes/quickRepliesNode";
import { profileAssistantPrompt } from "@lib/agents/profile/prompt";

export const createProfileAgent = (llm: ChatAnthropic) => {
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
  });

  const workflow = new StateGraph(GraphState);

  const profileNode = async (
    state: AgentState
  ): Promise<Partial<AgentState>> => {
    logger.agent("👤 Profile agent node processing", {
      userInboxId: state.userInboxId,
      lastMessage: state.lastMessage,
    });

    try {
      const profileTools = await getTools(state.userProfile);
      const filteredProfileTools = profileTools.filter(
        (tool) => tool.name.includes("profile") || tool.name.includes("edit")
      );

      const agent = createReactAgent({
        llm,
        tools: filteredProfileTools,
        messageModifier: profileAssistantPrompt(state),
      });

      const result = await agent.invoke({
        messages: [
          ...state.messages,
          { role: "user", content: state.lastMessage },
        ],
      });

      const lastMessage = result.messages[result.messages.length - 1];
      const responseContent = `${AGENT_EMOJIS.PROFILE} ${lastMessage.content as string}`;

      return {
        messages: [
          ...state.messages,
          { role: "user", content: state.lastMessage },
          { role: "assistant", content: responseContent },
        ],
        userProfile: state.userProfile || undefined,
        fundingData: state.fundingData,
      };
    } catch (error) {
      logger.error("👤 Profile agent error", {
        error: error instanceof Error ? error.message : String(error),
        userInboxId: state.userInboxId,
      });

      return {
        messages: [
          ...state.messages,
          { role: "user", content: state.lastMessage },
          {
            role: "assistant",
            content: `${AGENT_EMOJIS.PROFILE} ❌ Sorry, I encountered an error with profile management. Please try again or use /menu to return to the main menu.`,
          },
        ],
        userProfile: undefined,
        fundingData: state.fundingData,
      };
    }
  };

  // const quickRepliesNode = createQuickRepliesNode(llm);

  workflow.addNode("profile", profileNode);
  // workflow.addNode("suggestedReplies", quickRepliesNode);
  (workflow as any).addEdge(START, "profile");
  // (workflow as any).addEdge("profile", "suggestedReplies");
  // (workflow as any).addEdge("suggestedReplies", END);
  (workflow as any).addEdge("profile", END);

  return workflow.compile();
};
