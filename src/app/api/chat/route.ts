import { chatRoute } from "@/server/harness/routes";

export function POST(request: Request) {
  return chatRoute(request);
}
