import { resumeRoute } from "@/server/harness/routes";

export function POST(request: Request) {
  return resumeRoute(request);
}
