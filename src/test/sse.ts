export type StreamedEvent = { type: string; data: Record<string, unknown> };

// Reads a whole server-sent-events body into its events, in order.
export async function readEvents(response: Response): Promise<StreamedEvent[]> {
  const blocks = (await response.text()).split("\n\n").filter(Boolean);
  return blocks.map((block) => {
    const [eventLine = "", dataLine = ""] = block.split("\n");
    return {
      type: eventLine.replace(/^event: /, ""),
      data: JSON.parse(dataLine.replace(/^data: /, "")) as Record<string, unknown>,
    };
  });
}
