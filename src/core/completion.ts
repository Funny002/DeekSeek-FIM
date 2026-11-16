export interface CleanCompletionOptions {
  prefix: string;
  suffix: string;
  multiLine: boolean;
  /** The document's line ending: "\n" or "\r\n". */
  eol: string;
  maxChars?: number;
}

function trimSuffixOverlap(completion: string, suffix: string): string {
  const limit = Math.min(completion.length, suffix.length, 300);
  if (limit < 3) {
    return completion;
  }
  for (let length = limit; length >= 3; length -= 1) {
    if (completion.endsWith(suffix.slice(0, length))) {
      const remainder = completion.slice(0, completion.length - length);
      return remainder.replace(/\n+$/, "");
    }
  }
  return completion;
}

function trimPrefixOverlap(completion: string, prefix: string): string {
  const limit = Math.min(completion.length, prefix.length, 200);
  for (let length = limit; length >= 12; length -= 1) {
    if (completion.startsWith(prefix.slice(prefix.length - length))) {
      return completion.slice(length);
    }
  }
  return completion;
}

function truncateAtCodePoint(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  let end = maxChars;
  const code = text.charCodeAt(end);
  if (code >= 0xdc00 && code <= 0xdfff) {
    end -= 1;
  }
  return text.slice(0, end);
}

/**
 * FIM endpoints normally return just the middle text. This cleans up common
 * provider quirks (BOM, echoed prefix/suffix, CRLF, accidental extra newline)
 * before the text is handed to VS Code.
 */
export function cleanCompletion(
  raw: string,
  options: CleanCompletionOptions,
): string {
  let text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/[\r\n]$/.test(options.prefix) && text.startsWith("\n")) {
    text = text.slice(1);
  }

  text = trimPrefixOverlap(text, options.prefix);
  text = trimSuffixOverlap(text, options.suffix);

  if (!options.multiLine) {
    const firstNewline = text.indexOf("\n");
    text = firstNewline < 0 ? text : text.slice(0, firstNewline);
  }

  text = text.replace(/\n+$/, "");
  if (!text.trim()) {
    return "";
  }

  const maxChars = Math.max(1, Math.floor(options.maxChars ?? 20000));
  text = truncateAtCodePoint(text, maxChars);

  return options.eol === "\n" ? text : text.replace(/\n/g, options.eol);
}
