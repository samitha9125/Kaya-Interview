import { resetLimitRoute } from "@/server/harness/routes";

export function POST(request: Request) {
  return resetLimitRoute(request);
}
