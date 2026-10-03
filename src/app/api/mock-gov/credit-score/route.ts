import { creditScoreRoute } from "@/server/mock-gov";

export function POST(request: Request) {
  return creditScoreRoute(request);
}
