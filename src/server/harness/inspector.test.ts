import { fakeModel } from "langchain";
import { beforeEach, describe, expect, it } from "vitest";
import { chatRouteSetup } from "@/test/chat-routes";
import { scriptedBureau } from "@/test/fake-bureau";
import { ASSESSMENT_CALL } from "@/test/graph";
import { getInspector, type InspectorDeps, type InspectorView } from "./inspector";

let routes: ReturnType<typeof chatRouteSetup>;

beforeEach(() => {
  routes = chatRouteSetup(fakeModel().respondWithTools([ASSESSMENT_CALL]));
});

function inspectorDeps(demoMode = true): InspectorDeps {
  const { db, clock } = routes.deps;
  const credit = { db, clock, cacheTtlDays: 30, bureau: scriptedBureau([]).bureau };
  return { ...routes.deps, config: { DEMO_MODE: demoMode }, credit };
}

function inspect(conversationId: string, deps = inspectorDeps()) {
  const headers = new Headers({ cookie: `__Host-session=${routes.token()}` });
  const url = `http://localhost:3000/api/demo/inspector?conversationId=${conversationId}`;
  return getInspector(new Request(url, { headers }), deps);
}

async function aConversation(): Promise<string> {
  const { turn } = await routes.chat("Check my loan", { starter: "loan" });
  return turn.conversationId;
}

describe("harness/inspector: the demo panel's data", () => {
  it("P0-04: the owner gets the case, and the cached score as an age and state only", async () => {
    const conversationId = await aConversation();

    const response = await inspect(conversationId);

    const view = (await response.json()) as InspectorView;
    expect(response.status).toBe(200);
    expect(view.cachedScore).toEqual({ state: "none" });
    expect(view.timeline.map((line) => line.text)).toContain(
      "tool request_assessment → HANDED_OFF",
    );
  });

  it("P0-04: someone else's conversation answers 404 and shows nothing", async () => {
    const conversationId = await aConversation();
    routes.useGuestSession();

    const response = await inspect(conversationId);

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("request_assessment");
  });

  it("BR-SET-01: outside demo mode the route doesn't exist", async () => {
    const conversationId = await aConversation();

    const response = await inspect(conversationId, inspectorDeps(false));

    expect(response.status).toBe(404);
  });
});
