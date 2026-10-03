import { resetRoute } from "@/server/mock-gov";

export function POST(request: Request) {
  return resetRoute(request);
}
