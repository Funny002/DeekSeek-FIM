import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatUserPrompt,
  stripChatFences,
} from "../src/core/chatPrompt";

test("builds a fill-in-the-middle chat prompt", () => {
  const prompt = buildChatUserPrompt("const x = ", ";\n");
  assert.match(prompt, /<BEFORE>\nconst x = \n<\/BEFORE>/);
  assert.match(prompt, /<CURSOR>/);
  assert.match(prompt, /<AFTER>\n;\n\n<\/AFTER>/);
});

test("unwraps a fenced chat completion", () => {
  assert.equal(stripChatFences("```ts\nreturn 1;\n```"), "return 1;");
  assert.equal(stripChatFences("return 2;"), "return 2;");
  assert.equal(stripChatFences("<CURSOR>\nreturn 3;"), "return 3;");
});
