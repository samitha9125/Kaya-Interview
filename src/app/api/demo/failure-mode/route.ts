import { failureModeRoute } from "@/server/harness/routes";

export function POST(request: Request) {
  return failureModeRoute(request);
}
