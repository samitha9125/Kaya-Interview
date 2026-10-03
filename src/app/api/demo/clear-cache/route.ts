import { clearCacheRoute } from "@/server/harness/routes";

export function POST(request: Request) {
  return clearCacheRoute(request);
}
