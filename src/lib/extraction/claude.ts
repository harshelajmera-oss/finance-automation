import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_TOOL, type ExtractedFields } from "./schema";

const MODEL = "claude-sonnet-5";

const SUPPORTED_MEDIA_TYPES = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
} as const;

export type SupportedExtension = keyof typeof SUPPORTED_MEDIA_TYPES;

export function isExtractable(extension: string): extension is SupportedExtension {
  return extension in SUPPORTED_MEDIA_TYPES;
}

/**
 * Sends one document to Claude and returns the fields it read back.
 * Spreadsheets (bulk payout sheets) aren't sent here — those go through the
 * grid-view flow in a later step instead of field extraction.
 */
export async function extractInvoiceFields(
  bytes: Uint8Array,
  extension: SupportedExtension,
): Promise<ExtractedFields> {
  const client = new Anthropic();
  const mediaType = SUPPORTED_MEDIA_TYPES[extension];
  const data = Buffer.from(bytes).toString("base64");

  const documentBlock =
    mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: mediaType, data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mediaType, data } } as const);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    // Not `strict: true` — this schema has more nullable fields than the
    // strict-mode limit allows; forcing tool_choice below is enough to get
    // structured JSON back.
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          documentBlock,
          {
            type: "text",
            text: "Read this financial document and record its fields with the record_extraction tool. Use null for anything not present or not legible — never guess a value or invent data that isn't on the document.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");

  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return structured fields for this document.");
  }

  return toolUse.input as ExtractedFields;
}
