import { guestRoute } from "@/server/harness/routes";

export function POST(request: Request) {
  return guestRoute(request);
}
