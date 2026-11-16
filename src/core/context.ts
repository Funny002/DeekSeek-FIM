import type { FimContext } from "./types";

export interface ContextOptions {
  maxPrefixChars: number;
  maxSuffixChars: number;
  /**
   * Number of lines to include before the current line and after the current
   * line. The rest of the current line is always included.
   */
  contextLines: number;
}

function startOfLine(text: string, index: number): number {
  if (index <= 0) {
    return 0;
  }
  const newline = text.lastIndexOf("\n", index - 1);
  return newline < 0 ? 0 : newline + 1;
}

function previousLineStart(text: string, lineStart: number): number {
  if (lineStart <= 0) {
    return 0;
  }
  const newline = text.lastIndexOf("\n", lineStart - 2);
  return newline < 0 ? 0 : newline + 1;
}

function isLowSurrogate(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) {
    return false;
  }
  const code = text.charCodeAt(index);
  return code >= 0xdc00 && code <= 0xdfff;
}

function clampOffset(text: string, offset: number): number {
  return Math.max(0, Math.min(text.length, Math.floor(offset)));
}

/**
 * Extract a bounded prefix/suffix around the cursor. Lines are used as the
 * coarse boundary, then a hard character cap protects the token budget.
 */
export function buildFimContext(
  text: string,
  offset: number,
  options: ContextOptions,
): FimContext {
  const cursor = clampOffset(text, offset);
  const contextLines = Math.max(0, Math.floor(options.contextLines));
  const maxPrefix = Math.max(0, Math.floor(options.maxPrefixChars));
  const maxSuffix = Math.max(0, Math.floor(options.maxSuffixChars));

  let prefixStart = startOfLine(text, cursor);
  for (let i = 0; i < contextLines; i += 1) {
    prefixStart = previousLineStart(text, prefixStart);
  }
  prefixStart = Math.max(prefixStart, cursor - maxPrefix);
  if (isLowSurrogate(text, prefixStart)) {
    prefixStart += 1;
  }

  const currentLineEndRaw = text.indexOf("\n", cursor);
  let suffixEnd = currentLineEndRaw < 0 ? text.length : currentLineEndRaw;
  for (let i = 0; i < contextLines; i += 1) {
    if (suffixEnd >= text.length) {
      break;
    }
    const nextNewline = text.indexOf("\n", suffixEnd + 1);
    if (nextNewline < 0) {
      suffixEnd = text.length;
      break;
    }
    suffixEnd = nextNewline;
  }
  if (suffixEnd < text.length && text[suffixEnd] === "\n") {
    suffixEnd += 1;
  }
  suffixEnd = Math.min(suffixEnd, cursor + maxSuffix);
  if (isLowSurrogate(text, suffixEnd)) {
    suffixEnd -= 1;
  }

  return {
    prefix: text.slice(prefixStart, cursor),
    suffix: text.slice(cursor, Math.max(cursor, suffixEnd)),
  };
}
