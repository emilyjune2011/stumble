# Stumble

Pick your interests, click the button, land somewhere new on the internet. A StumbleUpon revival, as a Chrome extension.

## How it works

Click the **Stumble** button in your toolbar, or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>, and the current tab jumps to a random site that fits your interests. A slim bar appears at the top of the page:

- **Stumble!** goes to the next site
- **👍 / 👎** tell Stumble what you like, so it shows you more of it
- **Broken?** skips a dead link and never shows it again
- **⚙** opens your interests and settings
- **▴** shrinks the bar to a small pill, **✕** stops stumbling in that tab

Stumble never shows the same site twice, until you clear your history. New sites from the AI are checked to make sure they load before they're queued, and if a site won't load when you land on it, Stumble marks it dead and skips ahead on its own.

## Interests

Choose from Weird & wonderful, Music, Film & TV, Art & design, Science & space, Nostalgia, Travel & places, Food, Games & play, Reading & ideas, Nature & calm, Words & language, and History, or add your own (brutalism, synths, anything). A few wildcards are mixed in so you still get surprised.

## Language

Pick a preferred language in settings and Stumble will mostly show sites in that language, or ones that need no reading (music, maps, toys, art). It filters rather than blocks: sites in other languages still turn up now and then. This works best with an AI key, since the built-in list is mostly in English.

## Family-safe mode

Turn on **Family-safe mode** in settings and Stumble only shows sites suitable for ages 8 and up: no adult content, violence, gambling, alcohol, or places where strangers can chat. Built-in sites that don't fit are skipped, the AI is told the rules and has to label every site's audience, and anything not labeled "all ages" (or that trips a list of grown-up words) is blocked, not just shown less often.

Set a **parental PIN** to lock it: turning family-safe mode off, changing the PIN, or changing the AI settings then asks for it.

It has limits: it only controls the sites Stumble sends you to, not the rest of the browser, and anyone who can open `chrome://extensions` can switch Stumble off. AI labels can be wrong, too. Use it alongside your browser's or device's own parental controls.

## Endless stumbling (optional)

Out of the box, Stumble draws from a built-in list of about 180 hand-picked sites. Add an AI API key in settings and it keeps finding new ones in batches of 25, shaped by your 👍 and 👎. Pick your provider:

| Provider | Get a key at | Suggested models |
| --- | --- | --- |
| Claude (Anthropic) | [console.anthropic.com](https://console.anthropic.com) | `claude-sonnet-5`, `claude-haiku-4-5-20251001` |
| OpenAI | [platform.openai.com](https://platform.openai.com) | `gpt-6.1-sol`, `gpt-6-luna` |
| Gemini (Google) | [aistudio.google.com](https://aistudio.google.com) | `gemini-3.8-flash` |
| Other | Any OpenAI-compatible service: OpenRouter, Groq, Mistral, or [Ollama](https://ollama.com) running on your computer | Whatever the service offers |

You can type any model name your account can use. For **Other**, enter the service's base URL (for example `https://openrouter.ai/api/v1` or `http://localhost:11434/v1`). A key is optional there, since local models usually don't need one.

Stumble also avoids showing pages from the same website close together: a site you saw in your last 30 stumbles is skipped, and the AI is told not to suggest any page on sites you have already seen. Each batch asks for a set mix of kinds of site (mostly toys, games, tools, art, maps, live cams, audio and archives, with only a couple of blogs or essays unless you keep liking them), Stumble trims anything the AI over-delivers, and it avoids showing the same kind of site back to back. Each batch also leans a few random directions (one-person passion projects, the early web, museum archives, sites from outside the English-speaking world…) so you keep landing somewhere new.

### Privacy and cost

- Usage is billed to your own API account. Setting a monthly spending limit in your provider's dashboard is a good idea.
- Your key is stored only in Chrome's local storage on your computer. It is never in this repo, web pages can't read it, and it's sent only to the provider you pick. For **Other**, it goes to the base URL you enter, so only use services you trust.
- Stumble needs access to all websites so it can show its toolbar on whatever page you land on.

## Install

Stumble isn't on the Chrome Web Store yet, so you load it yourself:

1. Download this repo (**Code → Download ZIP**, then unzip) or clone it:
   ```bash
   git clone https://github.com/emilyjune2011/stumble.git
   ```
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `stumble` folder.
5. Pin Stumble to your toolbar and click it.

To change the keyboard shortcut, go to `chrome://extensions/shortcuts`.

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | Extension config (Manifest V3) |
| `background.js` | Picks sites, learns your taste, and asks the AI for new ones |
| `providers.js` | The AI providers Stumble can use |
| `langs.js` | The languages you can prefer |
| `sites.js` | The built-in list of sites by interest |
| `toolbar.js` | The bar injected at the top of pages |
| `options.html`, `options.js` | The settings page |
| `style.css` | Shared styles |
