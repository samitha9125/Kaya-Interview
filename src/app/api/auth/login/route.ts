import { loginRoute } from "@/server/harness/routes";

export function POST(request: Request) {
  return loginRoute(request);
}
