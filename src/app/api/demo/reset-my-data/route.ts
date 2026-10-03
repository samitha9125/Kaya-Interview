import { resetMyDataRoute } from "@/server/harness/routes";

export function POST(request: Request) {
  return resetMyDataRoute(request);
}
