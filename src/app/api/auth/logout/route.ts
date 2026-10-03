import { logoutRoute } from "@/server/harness/routes";

export function POST(request: Request) {
  return logoutRoute(request);
}
