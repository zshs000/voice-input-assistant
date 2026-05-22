export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionRequest = {
  model: string;
  temperature: number;
  stream: false;
  messages: ChatMessage[];
};

export type BuildChatCompletionRequestInput = {
  model: string;
  temperature: number;
  system: string;
  user: string;
};

export type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
    };
  }>;
};

export function buildChatCompletionRequest(
  input: BuildChatCompletionRequestInput,
): ChatCompletionRequest {
  return {
    model: input.model,
    temperature: input.temperature,
    stream: false,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  };
}

export function parseChatCompletionResponse(response: ChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("LLM returned empty content");
  }

  return content;
}

export async function polishWithOpenAICompatible(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  system: string;
  user: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetcher = input.fetchImpl ?? fetch;
  const endpoint = `${input.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify(
      buildChatCompletionRequest({
        model: input.model,
        temperature: input.temperature,
        system: input.system,
        user: input.user,
      }),
    ),
  });

  if (!response.ok) {
    throw new Error(`LLM request failed with status ${response.status}`);
  }

  return parseChatCompletionResponse((await response.json()) as ChatCompletionResponse);
}
