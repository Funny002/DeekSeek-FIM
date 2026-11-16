export const CHAT_SYSTEM_PROMPT = [
  "You are a precise code completion engine.",
  "Complete the code at <CURSOR> by returning only the text that should be inserted at that position.",
  "Do not repeat the before/after code. Do not use markdown fences. Do not explain.",
].join(" ");

export function buildChatUserPrompt(prefix: string, suffix: string): string {
  return [
    "<BEFORE>",
    prefix,
    "</BEFORE>",
    "<CURSOR>",
    "<AFTER>",
    suffix,
    "</AFTER>",
  ].join("\n");
}

/**
 * Chat models sometimes wrap the answer in a Markdown code block even when
 * asked not to. Only unwrap a block that covers the entire response.
 */
export function stripChatFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[^\n]*\n([\s\S]*?)\n```$/.exec(trimmed);
  if (fenced) {
    return fenced[1] ?? "";
  }
  return text.replace(/^<CURSOR>\s*/, "");
}
