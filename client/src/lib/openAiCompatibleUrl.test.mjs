import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOpenAIChatCompletionsPreview,
  normalizeOpenAICompatibleBaseURL,
} from "../../../shared/utils/openAiCompatibleUrl.ts";

test("adds /v1 when an OpenAI-compatible URL contains only an origin", () => {
  assert.equal(
    normalizeOpenAICompatibleBaseURL("https://api.example.com"),
    "https://api.example.com/v1",
  );
  assert.equal(
    normalizeOpenAICompatibleBaseURL(" https://api.example.com/ "),
    "https://api.example.com/v1",
  );
});

test("keeps explicit compatible API paths unchanged", () => {
  assert.equal(
    normalizeOpenAICompatibleBaseURL("https://api.example.com/v1/"),
    "https://api.example.com/v1",
  );
  assert.equal(
    normalizeOpenAICompatibleBaseURL("https://api.example.com/openai/v1"),
    "https://api.example.com/openai/v1",
  );
});

test("builds the final chat completions endpoint preview", () => {
  assert.equal(
    buildOpenAIChatCompletionsPreview("https://api.example.com"),
    "https://api.example.com/v1/chat/completions",
  );
  assert.equal(
    buildOpenAIChatCompletionsPreview("https://api.example.com/openai/v1"),
    "https://api.example.com/openai/v1/chat/completions",
  );
});

test("does not rewrite incomplete input while the user is typing", () => {
  assert.equal(normalizeOpenAICompatibleBaseURL("api.example.com"), "api.example.com");
  assert.equal(buildOpenAIChatCompletionsPreview("api.example.com"), "");
});
