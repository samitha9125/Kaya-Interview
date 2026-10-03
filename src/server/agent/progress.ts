import { z } from "zod";
import type { NodeConfig } from "./context";

// FR-WEB-04: what a node tells the customer while it works, sent on the
// stream's custom channel. Only code writes it, and the harness forwards
// nothing from that channel that doesn't match this shape.
export const ProgressUpdate = z.strictObject({ progress: z.string().min(1) });

export function reportProgress(config: NodeConfig, text: string): void {
  config.writer?.({ progress: text });
}
