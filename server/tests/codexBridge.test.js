const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const {
  buildCodexPrompt,
  extractOutputSchema,
  resolveRequestedCodexModel,
} = require("../dist/llm/codexBridge/codexBridgeProtocol.js");
const { createCodexBridgeHandler } = require("../dist/llm/codexBridge/codexBridgeServer.js");

test("Codex bridge protocol preserves roles and extracts native schemas", () => {
  const prompt = buildCodexPrompt([
    { role: "system", content: "只输出 JSON" },
    { role: "user", content: "生成故事方向" },
  ]);
  assert.match(prompt, /===== SYSTEM =====\n只输出 JSON/);
  assert.match(prompt, /===== USER =====\n生成故事方向/);
  assert.match(prompt, /不要执行命令/);

  const schema = { type: "object", properties: { status: { type: "string" } } };
  assert.deepEqual(extractOutputSchema({
    type: "json_schema",
    json_schema: { schema },
  }), schema);
  assert.equal(resolveRequestedCodexModel("local-chatgpt"), undefined);
  assert.equal(resolveRequestedCodexModel("gpt-5.6-sol"), "gpt-5.6-sol");
});

test("Codex bridge exposes OpenAI-compatible JSON and SSE responses", async () => {
  const calls = [];
  const handler = createCodexBridgeHandler(async (input) => {
    calls.push(input);
    return {
      text: JSON.stringify({ status: "ok" }),
      usage: {
        inputTokens: 120,
        cachedInputTokens: 80,
        outputTokens: 12,
        reasoningOutputTokens: 3,
      },
    };
  });
  const server = http.createServer((req, res) => void handler(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseURL = `http://127.0.0.1:${address.port}`;

  try {
    const schema = {
      type: "object",
      properties: { status: { type: "string" } },
      required: ["status"],
      additionalProperties: false,
    };
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "local-chatgpt",
        messages: [{ role: "user", content: "只回复 ok" }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "probe", strict: true, schema },
        },
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.choices[0].message.content, '{"status":"ok"}');
    assert.equal(payload.usage.total_tokens, 132);
    assert.deepEqual(calls[0].outputSchema, schema);

    const streamResponse = await fetch(`${baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "local-chatgpt",
        messages: [{ role: "user", content: "只回复 ok" }],
        stream: true,
      }),
    });
    assert.equal(streamResponse.status, 200);
    assert.match(streamResponse.headers.get("content-type"), /text\/event-stream/);
    const streamText = await streamResponse.text();
    assert.match(streamText, /chat\.completion\.chunk/);
    assert.match(streamText, /\\"status\\":\\"ok\\"/);
    assert.match(streamText, /data: \[DONE\]/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
