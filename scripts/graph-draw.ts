import { mkdirSync, writeFileSync } from "node:fs";
import { MemorySaver } from "@langchain/langgraph";
import { ScriptedChatProvider } from "@/server/adapters/scripted-chat-provider";
import { buildConversationGraph } from "@/server/agent/graph";
import { scriptedBureau } from "@/test/fake-bureau";
import { callbackTestDeps, onboardingTestDeps } from "@/test/graph";
import { lendingTestSetup } from "@/test/lending-setup";

// `pnpm graph:draw`: the agent graph as Mermaid, drawn from the compiled
// graph itself (LangGraph's getGraphAsync().drawMermaid()), so the diagram
// can't drift from the code. Drawing runs no node, so test deps and no
// model key are enough.
const OUTPUT = "docs/diagrams/agent-graph.mmd";

async function drawGraph() {
  const lending = lendingTestSetup(scriptedBureau([]).bureau).deps;
  const graph = buildConversationGraph({
    models: new ScriptedChatProvider(),
    lending,
    onboarding: onboardingTestDeps(lending),
    callbacks: callbackTestDeps(lending),
    isStepUpFresh: () => false,
    checkpointer: new MemorySaver(),
  });
  const drawable = await graph.getGraphAsync();
  mkdirSync("docs/diagrams", { recursive: true });
  writeFileSync(OUTPUT, drawable.drawMermaid());
  console.log(`Wrote ${OUTPUT}`);
}

void drawGraph();
