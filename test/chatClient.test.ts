import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { ChatClient } from "../src/api/chatClient";
import type { ModelConfig } from "../src/core/types";

const model: ModelConfig = {
  uid: "chat-test",
  name: "Chat Test",
  model: "chat-model",
  apiUrl: "",
  protocol: "chat",
};

async function withServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("sends a chat completion request and unwraps fenced content", async () => {
  let path: string | undefined;
  let authorization: string | undefined;
  let body: Record<string, unknown> | undefined;
  await withServer(
    (request, response) => {
      let raw = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        raw += chunk;
      });
      request.on("end", () => {
        path = request.url;
        authorization = request.headers.authorization;
        body = JSON.parse(raw) as Record<string, unknown>;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            choices: [
              {
                message: { content: "```ts\nreturn a + b;\n```" },
                finish_reason: "stop",
              },
            ],
            usage: { completion_tokens: 6 },
          }),
        );
      });
    },
    async (baseUrl) => {
      const client = new ChatClient();
      const result = await client.complete({
        model: { ...model, apiUrl: `${baseUrl}/v1` },
        apiKey: "sk-chat",
        prompt: "function add(a, b) {\n  ",
        suffix: "\n}\n",
        maxTokens: 32,
        temperature: 0,
        topP: 1,
        timeoutMs: 5000,
      });
      assert.equal(result.text, "return a + b;");
      assert.equal(result.finishReason, "stop");
      assert.equal(authorization, "Bearer sk-chat");
      assert.equal(path, "/v1/chat/completions");
      assert.equal(body?.model, "chat-model");
      const messages = body?.messages as Array<{ role: string; content: string }>;
      assert.equal(messages[0]?.role, "system");
      assert.match(messages[1]?.content ?? "", /<BEFORE>/);
      assert.match(messages[1]?.content ?? "", /<AFTER>/);
    },
  );
});
