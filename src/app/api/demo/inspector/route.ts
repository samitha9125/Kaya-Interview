import { inspectorRoute } from "@/server/harness/routes";

export function GET(request: Request) {
  return inspectorRoute(request);
}
