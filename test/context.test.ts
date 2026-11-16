import assert from "node:assert/strict";
import test from "node:test";
import { buildFimContext } from "../src/core/context";

const options = {
  maxPrefixChars: 100,
  maxSuffixChars: 100,
  contextLines: 1,
};

test("buildFimContext includes the current line and surrounding lines", () => {
  const text = "line1\nline2\nline3\n";
  const context = buildFimContext(text, 8, options);
  assert.equal(context.prefix, "line1\nli");
  assert.equal(context.suffix, "ne2\nline3\n");
});

test("buildFimContext keeps the current line with zero context lines", () => {
  const text = "const value = 1;\nnext";
  const context = buildFimContext(text, 6, {
    ...options,
    contextLines: 0,
  });
  assert.equal(context.prefix, "const ");
  assert.equal(context.suffix, "value = 1;\n");
});

test("buildFimContext caps prefix and suffix characters", () => {
  const text = "abcdefghij\nklmnopqrst\n";
  const context = buildFimContext(text, 14, {
    maxPrefixChars: 5,
    maxSuffixChars: 4,
    contextLines: 5,
  });
  assert.equal(context.prefix, "j\nklm");
  assert.equal(context.suffix, "nopq");
});

test("buildFimContext handles the start of a document", () => {
  const context = buildFimContext("hello world", 0, options);
  assert.equal(context.prefix, "");
  assert.equal(context.suffix, "hello world");
});

test("buildFimContext does not split a surrogate pair", () => {
  const text = "😀abc";
  const context = buildFimContext(text, 3, {
    maxPrefixChars: 2,
    maxSuffixChars: 10,
    contextLines: 0,
  });
  assert.equal(context.prefix, "a");
});

test("buildFimContext clamps an out-of-range offset", () => {
  const text = "abc";
  const context = buildFimContext(text, 999, options);
  assert.equal(context.prefix, "abc");
  assert.equal(context.suffix, "");
});
