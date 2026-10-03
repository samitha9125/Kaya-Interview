import { modelChoiceRoute } from "@/server/harness/routes";

export function POST(request: Request) {
  return modelChoiceRoute(request);
}
