// AI providers Stumble can use to find new sites. Everything except Claude speaks the OpenAI chat format.
const PROVIDERS = {
  anthropic: { name: "Claude", url: "https://api.anthropic.com/v1/messages", keyHint: "sk-ant-…", console: "console.anthropic.com",
    models: [["claude-sonnet-5-5", "Claude Sonnet 5.5 (best finds)"], ["claude-sonnet-5", "Claude Sonnet 5"], ["claude-haiku-4-5-20251001", "Claude Haiku 4.5 (cheaper, faster)"]] },
  openai: { name: "OpenAI", url: "https://api.openai.com/v1/chat/completions", keyHint: "sk-…", console: "platform.openai.com",
    models: [["gpt-6.1-sol", "GPT-6.1 Sol (better finds)"], ["gpt-6-luna", "GPT-6 Luna (cheaper, faster)"]] },
  gemini: { name: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", keyHint: "AIza…", console: "aistudio.google.com",
    models: [["gemini-3.8-flash", "Gemini 3.8 Flash"]] },
  custom: { name: "your AI service", url: "", keyHint: "Leave blank if your service doesn't need one", console: "",
    models: [] }
};
const providerOf = st => PROVIDERS[st.provider] || PROVIDERS.anthropic;
const cleanKey = k => String(k || "").replace(/[^\x21-\x7E]/g, "");   // strip invisible characters picked up when pasting
// Where to send requests: the provider's endpoint, or the custom base URL + /chat/completions.
function endpointOf(st) {
  if (st.provider !== "custom") return providerOf(st).url;
  const base = String(st.baseUrl || "").trim().replace(/\/+$/, "");
  return /\/chat\/completions$/.test(base) ? base : base + "/chat/completions";
}
// AI is on with a key, or with just a base URL for a custom service (local models often need no key).
const aiOn = st => !!(cleanKey(st.apiKey) || (st.provider === "custom" && String(st.baseUrl || "").trim()));
