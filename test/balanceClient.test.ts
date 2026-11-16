import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { BalanceClient } from "../src/api/balanceClient";
import type { ModelConfig } from "../src/core/types";

const model: ModelConfig = {
  uid: "balance-test",
  name: "Balance Test",
  model: "deepseek-flash",
  apiUrl: "",
  protocol: "deepseek",
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

test("fetches a balance with bearer auth", async () => {
  let authorization: string | undefined;
  let path: string | undefined;
  await withServer(
    (request, response) => {
      authorization = request.headers.authorization;
      path = request.url;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          is_available: true,
          balance_infos: [
            {
              currency: "CNY",
              total_balance: "8.88",
              granted_balance: "0.00",
              topped_up_balance: "8.88",
            },
          ],
        }),
      );
    },
    async (baseUrl) => {
      const client = new BalanceClient();
      const balance = await client.get(
        { ...model, apiUrl: `${baseUrl}/beta/completions` },
        "sk-test",
      );
      assert.equal(balance.isAvailable, true);
      assert.equal(balance.balances[0]?.totalBalance, "8.88");
      assert.equal(authorization, "Bearer sk-test");
      assert.equal(path, "/user/balance");
    },
  );
});
