import { failureModeRoute } from "@/server/mock-gov";

export function POST(request: Request) {
  return failureModeRoute(request);
}
