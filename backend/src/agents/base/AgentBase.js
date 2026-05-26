import OpenAI from "openai";
import { config, assertOpenAI } from "../../config/env.js";

let _client = null;

/** Reuse one OpenAI client across agent calls in the same server process. */
export function getOpenAIClient() {
  assertOpenAI();
  if (!_client) _client = new OpenAI({ apiKey: config.openai.apiKey });
  return _client;
}

/**
 * Abstract base for any agent.
 * Concrete agents implement systemPrompt() and userPrompt(context),
 * call run(context), and parse the JSON result themselves.
 */
export class AgentBase {
  constructor({ name, model = config.openai.model, temperature = 0.7, maxTokens = 900 } = {}) {
    this.name = name;
    this.model = model;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.client = getOpenAIClient();
  }

  systemPrompt() {
    throw new Error("systemPrompt() must be implemented by subclass");
  }

  userPrompt(/* context */) {
    throw new Error("userPrompt(context) must be implemented by subclass");
  }

  async run(context) {
    // Base agents are JSON-only: scheduling code can consume structured output safely.
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt() },
        { role: "user", content: this.userPrompt(context) },
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0].message.content.trim();
    try {
      return JSON.parse(raw);
    } catch (err) {
      // Include raw model output so prompt/formatting failures are debuggable.
      throw new Error(`[${this.name}] Failed to parse JSON: ${err.message}\nRaw: ${raw}`);
    }
  }
}
