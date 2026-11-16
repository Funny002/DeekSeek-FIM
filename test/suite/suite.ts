import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import * as vscode from "vscode";
import type { FimInlineCompletionProvider } from "../../src/inlineProvider";
import type { ModelStore } from "../../src/modelStore";
import type { SettingsPanel } from "../../src/settingsPanel";

const EXTENSION_ID = "local.deepseek-fim";
const CONFIGURATION = "deepseek-fim";

interface TestApi {
  test?: {
    provider: FimInlineCompletionProvider;
    store: ModelStore;
    panel: SettingsPanel;
  };
}

async function ensureActivated(): Promise<vscode.Extension<TestApi>> {
  const extension = vscode.extensions.getExtension<TestApi>(EXTENSION_ID);
  assert.ok(extension, "extension should be discoverable");
  await extension.activate();
  return extension;
}

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

const tests: Array<[string, () => Promise<void>]> = [
  [
    "activates the extension",
    async () => {
      const extension = await ensureActivated();
      assert.equal(extension.isActive, true);
    },
  ],
  [
    "registers all contributed commands",
    async () => {
      const commands = await vscode.commands.getCommands(true);
      for (const command of [
        "deepseek-fim.openSettings",
        "deepseek-fim.triggerCompletion",
        "deepseek-fim.toggle",
        "deepseek-fim.setApiKey",
        "deepseek-fim.queryBalance",
        "deepseek-fim.showStats",
        "deepseek-fim.showDiagnostics",
        "deepseek-fim.resetStats",
        "deepseek-fim.clearCache",
      ]) {
        assert.ok(commands.includes(command), `${command} should be registered`);
      }
    },
  ],
  [
    "toggles the enabled setting and restores it",
    async () => {
      const configuration = vscode.workspace.getConfiguration(CONFIGURATION);
      const before = configuration.get<boolean>("enabled", true);
      await vscode.commands.executeCommand("deepseek-fim.toggle");
      const after = vscode.workspace
        .getConfiguration(CONFIGURATION)
        .get<boolean>("enabled", true);
      assert.equal(after, !before);
      await vscode.commands.executeCommand("deepseek-fim.toggle");
      const restored = vscode.workspace
        .getConfiguration(CONFIGURATION)
        .get<boolean>("enabled", true);
      assert.equal(restored, before);
    },
  ],
  [
    "clears the completion cache",
    async () => {
      await vscode.commands.executeCommand("deepseek-fim.clearCache");
    },
  ],
  [
    "returns an inline completion from a mocked FIM endpoint",
    async () => {
      const extension = await ensureActivated();
      const api = extension.exports;
      assert.ok(api.test, "test hooks should be exposed in ExtensionMode.Test");
      await vscode.workspace
        .getConfiguration(CONFIGURATION)
        .update("enabled", true, vscode.ConfigurationTarget.Global);

      let requestBody: Record<string, unknown> | undefined;
      let authorization: string | undefined;
      let requestCount = 0;
      const server = await listen((request, response) => {
        requestCount += 1;
        let raw = "";
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
          raw += chunk;
        });
        request.on("end", () => {
          authorization = request.headers.authorization;
          requestBody = JSON.parse(raw) as Record<string, unknown>;
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              choices: [{ text: "a + b" }],
              usage: { completion_tokens: 4 },
            }),
          );
        });
      });

      try {
        const model = await api.test.store.upsertModel({
          name: "Integration Mock",
          model: "mock-fim",
          apiUrl: `${server.url}/v1/completions`,
          protocol: "openai",
          apiKey: "integration-key",
        });
        await api.test.store.setActiveModel(model.uid);

        const document = await vscode.workspace.openTextDocument({
          language: "typescript",
          content: "function add(a, b) {\n  return ;\n}\n",
        });
        const tokenSource = new vscode.CancellationTokenSource();
        try {
          const items = await api.test.provider.provideInlineCompletionItems(
            document,
            new vscode.Position(1, 9),
            {
              triggerKind: vscode.InlineCompletionTriggerKind.Invoke,
              selectedCompletionInfo: undefined,
            },
            tokenSource.token,
          );
          assert.equal(items.length, 1);
          const item = items[0]!;
          const text =
            typeof item.insertText === "string"
              ? item.insertText
              : item.insertText.value;
          assert.equal(text, "a + b");
          assert.equal(authorization, "Bearer integration-key");
          assert.equal(requestBody?.model, "mock-fim");
          assert.equal(requestBody?.prompt, "function add(a, b) {\n  return ");
          assert.equal(requestBody?.suffix, ";\n}\n");
          assert.equal(requestBody?.top_p, 1);

          const cached = await api.test.provider.provideInlineCompletionItems(
            document,
            new vscode.Position(1, 9),
            {
              triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
              selectedCompletionInfo: undefined,
            },
            tokenSource.token,
          );
          assert.equal(cached.length, 1);
          assert.equal(requestCount, 1, "automatic call should hit the cache");
        } finally {
          tokenSource.dispose();
        }
      } finally {
        await server.close();
      }
    },
  ],
  [
    "returns a chat fallback completion",
    async () => {
      const extension = await ensureActivated();
      const api = extension.exports;
      assert.ok(api.test, "test hooks should be exposed in ExtensionMode.Test");

      let requestBody: Record<string, unknown> | undefined;
      let path: string | undefined;
      const server = await listen((request, response) => {
        let raw = "";
        path = request.url;
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
          raw += chunk;
        });
        request.on("end", () => {
          requestBody = JSON.parse(raw) as Record<string, unknown>;
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              choices: [
                {
                  message: { content: "a + b" },
                  finish_reason: "stop",
                },
              ],
            }),
          );
        });
      });

      try {
        const model = await api.test.store.upsertModel({
          name: "Chat Mock",
          model: "chat-mock",
          apiUrl: `${server.url}/v1`,
          protocol: "chat",
          apiKey: "chat-key",
        });
        await api.test.store.setActiveModel(model.uid);
        api.test.provider.clearCache();

        const document = await vscode.workspace.openTextDocument({
          language: "typescript",
          content: "function add(a, b) {\n  return ;\n}\n",
        });
        const tokenSource = new vscode.CancellationTokenSource();
        try {
          const items = await api.test.provider.provideInlineCompletionItems(
            document,
            new vscode.Position(1, 9),
            {
              triggerKind: vscode.InlineCompletionTriggerKind.Invoke,
              selectedCompletionInfo: undefined,
            },
            tokenSource.token,
          );
          assert.equal(items.length, 1);
          const item = items[0]!;
          const text =
            typeof item.insertText === "string"
              ? item.insertText
              : item.insertText.value;
          assert.equal(text, "a + b");
          assert.equal(path, "/v1/chat/completions");
          const messages = requestBody?.messages as Array<{
            role: string;
            content: string;
          }>;
          assert.equal(messages[0]?.role, "system");
          assert.match(messages[1]?.content ?? "", /return /);
        } finally {
          tokenSource.dispose();
          api.test.provider.clearCache();
        }
      } finally {
        await server.close();
      }
    },
  ],
  [
    "retries a transient server failure",
    async () => {
      const extension = await ensureActivated();
      const api = extension.exports;
      assert.ok(api.test, "test hooks should be exposed in ExtensionMode.Test");
      const configuration = vscode.workspace.getConfiguration(CONFIGURATION);
      await configuration.update(
        "retryCount",
        1,
        vscode.ConfigurationTarget.Global,
      );
      await configuration.update(
        "retryDelayMs",
        10,
        vscode.ConfigurationTarget.Global,
      );

      let requests = 0;
      const server = await listen((_request, response) => {
        requests += 1;
        if (requests === 1) {
          response.writeHead(500, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: { message: "temporary" } }));
          return;
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            choices: [{ text: "a + b", finish_reason: "stop" }],
          }),
        );
      });

      try {
        const model = await api.test.store.upsertModel({
          name: "Retry Mock",
          model: "retry-mock",
          apiUrl: `${server.url}/v1/completions`,
          protocol: "openai",
          apiKey: "retry-key",
        });
        await api.test.store.setActiveModel(model.uid);
        api.test.provider.clearCache();

        const document = await vscode.workspace.openTextDocument({
          language: "typescript",
          content: "function add(a, b) {\n  return ;\n}\n",
        });
        const tokenSource = new vscode.CancellationTokenSource();
        try {
          const items = await api.test.provider.provideInlineCompletionItems(
            document,
            new vscode.Position(1, 9),
            {
              triggerKind: vscode.InlineCompletionTriggerKind.Invoke,
              selectedCompletionInfo: undefined,
            },
            tokenSource.token,
          );
          assert.equal(items.length, 1);
          assert.equal(requests, 2, "the first 500 should be retried");
        } finally {
          tokenSource.dispose();
          api.test.provider.clearCache();
        }
      } finally {
        await configuration.update(
          "retryDelayMs",
          300,
          vscode.ConfigurationTarget.Global,
        );
        await server.close();
      }
    },
  ],
  [
    "does not auto-trigger when autoTrigger is disabled",
    async () => {
      const extension = await ensureActivated();
      const api = extension.exports;
      assert.ok(api.test, "test hooks should be exposed in ExtensionMode.Test");
      const configuration = vscode.workspace.getConfiguration(CONFIGURATION);
      await configuration.update(
        "autoTrigger",
        false,
        vscode.ConfigurationTarget.Global,
      );
      try {
        const document = await vscode.workspace.openTextDocument({
          language: "typescript",
          content: "const value = ;\n",
        });
        const tokenSource = new vscode.CancellationTokenSource();
        try {
          const items = await api.test.provider.provideInlineCompletionItems(
            document,
            new vscode.Position(0, 14),
            {
              triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
              selectedCompletionInfo: undefined,
            },
            tokenSource.token,
          );
          assert.equal(items.length, 0);
        } finally {
          tokenSource.dispose();
        }
      } finally {
        await configuration.update(
          "autoTrigger",
          true,
          vscode.ConfigurationTarget.Global,
        );
      }
    },
  ],
  [
    "backs off automatic requests after an HTTP failure",
    async () => {
      const extension = await ensureActivated();
      const api = extension.exports;
      assert.ok(api.test, "test hooks should be exposed in ExtensionMode.Test");

      let requests = 0;
      const server = await listen((_request, response) => {
        requests += 1;
        response.writeHead(401, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: { message: "invalid api key" } }));
      });

      try {
        const model = await api.test.store.upsertModel({
          name: "Failure Mock",
          model: "failure-mock",
          apiUrl: `${server.url}/v1/completions`,
          protocol: "openai",
          apiKey: "bad-key",
        });
        await api.test.store.setActiveModel(model.uid);
        api.test.provider.clearCache();

        const document = await vscode.workspace.openTextDocument({
          language: "typescript",
          content: "const value = ;\n",
        });
        const tokenSource = new vscode.CancellationTokenSource();
        try {
          const trigger = {
            triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
            selectedCompletionInfo: undefined,
          };
          const first = await api.test.provider.provideInlineCompletionItems(
            document,
            new vscode.Position(0, 14),
            trigger,
            tokenSource.token,
          );
          const second = await api.test.provider.provideInlineCompletionItems(
            document,
            new vscode.Position(0, 14),
            trigger,
            tokenSource.token,
          );
          assert.equal(first.length, 0);
          assert.equal(second.length, 0);
          assert.equal(requests, 1, "cooldown should suppress the second call");
        } finally {
          tokenSource.dispose();
          api.test.provider.clearCache();
        }
      } finally {
        await server.close();
      }
    },
  ],
  [
    "loads the settings webview",
    async () => {
      const extension = await ensureActivated();
      const api = extension.exports;
      assert.ok(api.test, "test hooks should be exposed in ExtensionMode.Test");
      await vscode.commands.executeCommand("deepseek-fim.openSettings");

      const deadline = Date.now() + 8000;
      while (!api.test.panel.isReady && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(
        api.test.panel.isReady,
        true,
        "the webview should load HTML and send the ready message",
      );
    },
  ],
];

export async function run(): Promise<void> {
  for (const [name, test] of tests) {
    const startedAt = Date.now();
    try {
      await test();
      console.log(`  ✔ ${name} (${Date.now() - startedAt}ms)`);
    } catch (error) {
      console.error(`  ✖ ${name}`);
      throw error;
    }
  }
  console.log(`\n${tests.length} integration tests passed.`);
}
