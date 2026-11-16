import assert from "node:assert/strict";
import test from "node:test";
import { cleanCompletion } from "../src/core/completion";

const base = {
  prefix: "function add(a, b) {\n  return ",
  suffix: ";\n}\n",
  multiLine: true,
  eol: "\n",
};

test("cleanCompletion keeps the middle text", () => {
  assert.equal(cleanCompletion("a + b", base), "a + b");
});

test("cleanCompletion removes one extra leading newline", () => {
  const prefix = "function add(a, b) {\n";
  assert.equal(
    cleanCompletion("\n  return a + b;", { ...base, prefix }),
    "  return a + b;",
  );
});

test("cleanCompletion trims an echoed suffix", () => {
  assert.equal(
    cleanCompletion("a + b;\n}", {
      ...base,
      suffix: ";\n}\n",
    }),
    "a + b",
  );
});

test("cleanCompletion trims an echoed prefix", () => {
  const prefix = "function add(a, b) {\n  const result = ";
  assert.equal(
    cleanCompletion("const result = a + b", { ...base, prefix }),
    "a + b",
  );
});

test("cleanCompletion limits a single line", () => {
  assert.equal(
    cleanCompletion("a + b;\n  console.log(a + b);", {
      ...base,
      multiLine: false,
    }),
    "a + b;",
  );
});

test("cleanCompletion returns empty for whitespace", () => {
  assert.equal(cleanCompletion("  \n\n", base), "");
});

test("cleanCompletion converts to CRLF", () => {
  assert.equal(
    cleanCompletion("a + b;\n}", {
      ...base,
      suffix: "\n",
      eol: "\r\n",
    }),
    "a + b;\r\n}",
  );
});

test("cleanCompletion does not split a surrogate pair when truncating", () => {
  const options = {
    prefix: "",
    suffix: "",
    multiLine: true,
    eol: "\n",
    maxChars: 2,
  };
  assert.equal(cleanCompletion("a😀b", options), "a");
  assert.equal(cleanCompletion("a😀b", { ...options, maxChars: 3 }), "a😀");
});
