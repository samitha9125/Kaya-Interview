import { ageCacheRoute } from "@/server/harness/routes";

export function POST(request: Request) {
  return ageCacheRoute(request);
}
