import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { FimClient } from "../src/api/client";
import { FimRequestError } from "../src/api/errors";
import type { ModelConfig } from "../src/core/types";

const baseModel: ModelConfig = {
  uid: "test",
  name: "Test",
  model: "test-model",
  apiUrl: "",
  protocol: "openai",
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

test("client posts a FIM request and parses the response", async () => {
  let received:
    | {
        authorization: string | undefined;
        body: Record<string, unknown>;
      }
    | undefined;

  await withServer(
    (request, response) => {
      let raw = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        raw += chunk;
      });
      request.on("end", () => {
        received = {
          authorization: request.headers.authorization,
          body: JSON.parse(raw) as Record<string, unknown>,
        };
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            choices: [{ text: "42" }],
            usage: { completion_tokens: 1 },
          }),
        );
      });
    },
    async (baseUrl) => {
      const client = new FimClient();
      const result = await client.complete({
        model: { ...baseModel, apiUrl: `${baseUrl}/v1` },
        apiKey: "sk-test",
        prompt: "const answer = ",
        suffix: ";",
        maxTokens: 16,
        temperature: 0.1,
        topP: 0.9,
        stop: ["\n\n"],
        timeoutMs: 5000,
      });
      assert.equal(result.text, "42");
      assert.equal(result.usage.completionTokens, 1);
      assert.equal(received?.authorization, "Bearer sk-test");
      assert.equal(received?.body.model, "test-model");
      assert.equal(received?.body.prompt, "const answer = ");
      assert.equal(received?.body.suffix, ";");
      assert.equal(received?.body.max_tokens, 16);
      assert.equal(received?.body.top_p, 0.9);
      assert.deepEqual(received?.body.stop, ["\n\n"]);
      assert.equal(received?.body.stream, false);
    },
  );
});

test("client surfaces HTTP errors", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "invalid api key" } }));
    },
    async (baseUrl) => {
      const client = new FimClient();
      await assert.rejects(
        () =>
          client.complete({
            model: { ...baseModel, apiUrl: baseUrl },
            prompt: "a",
            suffix: "",
            maxTokens: 8,
            temperature: 0,
            topP: 1,
            timeoutMs: 5000,
          }),
        (error: unknown) => {
          assert.ok(error instanceof FimRequestError);
          assert.equal(error.kind, "http");
          assert.equal(error.status, 401);
          assert.match(error.message, /invalid api key/);
          return true;
        },
      );
    },
  );
});

test("client returns an aborted error when the signal is already aborted", async () => {
  const client = new FimClient();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      client.complete({
        model: { ...baseModel, apiUrl: "http://127.0.0.1:9/v1" },
        prompt: "a",
        suffix: "",
        maxTokens: 8,
        temperature: 0,
        topP: 1,
        timeoutMs: 5000,
        signal: controller.signal,
      }),
    (error: unknown) => {
      assert.ok(error instanceof FimRequestError);
      assert.equal(error.kind, "aborted");
      return true;
    },
  );
});
