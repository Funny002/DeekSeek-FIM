import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { ModelsClient } from "../src/api/modelsClient";

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

test("fetches the model list with bearer auth", async () => {
  let authorization: string | undefined;
  let path: string | undefined;
  await withServer(
    (request, response) => {
      authorization = request.headers.authorization;
      path = request.url;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          object: "list",
          data: [
            { id: "deepseek-flash", object: "model", owned_by: "deepseek" },
            { id: "deepseek-v4-pro", object: "model", owned_by: "deepseek" },
          ],
        }),
      );
    },
    async (baseUrl) => {
      const client = new ModelsClient();
      const models = await client.list(`${baseUrl}/v1/completions`, "sk-test");
      assert.deepEqual(
        models.map((model) => model.id),
        ["deepseek-flash", "deepseek-v4-pro"],
      );
      assert.equal(authorization, "Bearer sk-test");
      assert.equal(path, "/v1/models");
    },
  );
});
