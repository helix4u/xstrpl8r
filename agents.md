# Agents
i installed grep sed awk tail head etc. to path. you have core utils+ fallbacks in the path. this means you can do search and replace etc. the posix or unix way directly on my windows console. you should do this so that you don't waste tokens using other tools that you arent familiar with as much that break all the time for you. because you don't know how to use them... you just try and adapt. i know you were trained on sed and grep and tail etc.. i've seen you work on the web version. just pretend we're in a unix env so you can use those tools. they're set up for exactly this purpose. poershell and shit wastes output tokens. it's lame. you should be effecient. they should let me default you to being effecient. no command wrappers. no pwsh -nologo -command blah blah blah... that's way too long. just ls. or grep blah. or sed blah... no need to even do bash, cuz bash you might have to use an alternate file path... i installed core utils and shit. it's windows built to use the limux commands. just do it. also, stop relying on python to do injections. you're terrible at it. powershel is fine every once in a while. but like holy shit. you take way too long and go way too overboard on tasks. listen to my intent. do what i ask, nothing more. dont do extra shit. i have rate limits. you're an asshole. if you error doing shit more than like 3 times, you've got yourself in a broken state. break out. it's not hard. do things. do things quickly. do not spend 5 hours thinking about fixes related to what i'm asking. i want things fixed when i ask, not refactored to a new product. this is insanity. gaaaah.... 
## System Overview
The project runs entirely on the client machine and is split across three cooperating agents plus an external provider:
- A browser-side content agent that observes X.com and packages tweet telemetry.
- A background coordination agent that brokers messages and persists state.
- A local analysis agent (Node.js Express server) that enriches and stores data, optionally backed by ChromaDB.
- OpenAI (or a compatible service) supplies embeddings and language model completions.

## Browser Content Agent (`content.js`)
- Boots when the extension loads, wiring listeners for popup commands (`startAnalysis`) and DOM mutations.
- Extracts tweet text, author metadata, engagement signals, and coarse account age from the live DOM.
- Deduplicates tweets with an in-memory `Set`, updates local popup statistics, and forwards new tweets to the background agent for enrichment.
- Key entry points: `init()`, `startAnalysis()`, `processTweet()`, `extractTweetData()`.

## Background Coordination Agent (`background.js`)
- Acts as the broker between popup UX and the local analysis server.
- Pulls API credentials from `chrome.storage.sync`, performs health checks, and relays tweets/questions via `fetch` to `http://localhost:3001`.
- Keeps popup counters up to date, proxies capture/QA requests to the local server, and relays status back to the popup.
- Critical functions: `handleTweetProcessing()`, `askQuestion()`, `showNotification()`.

## Local Analysis Agent
### Full Chroma-backed server (`server/server.js`)
- Hosts REST endpoints for storing tweets, querying via embeddings, tracking stats, and health checks.
- Manages an embedded Chroma collection (`x_tweets`) and caches OpenAI config to avoid redundant client creation.
- Workflow: generate embeddings and persist tweet metadata/embedding; all narrative explanation happens later when a query is issued.
- Recent fix: sanitises user-supplied “Completions URL” to ensure it points at the API base (e.g., `https://api.openai.com/v1`) before calling embeddings/completions, preventing 404 errors when users provided the full `/v1/chat/completions` path.

### Lightweight in-memory server (`server/simple-server.js`)
- Default `npm start` target for rapid iteration when Chroma is unavailable.
- Mirrors the REST surface but stores tweets in RAM and performs keyword filtering instead of vector search.
- Shares the same OpenAI initialisation safeguards and error reporting as the full server after the recent fixes.

## External Provider (OpenAI-compatible API)
- Requires an API key, base URL, and chat model name supplied through the popup UI.
- Embeddings default to `text-embedding-3-small`; chat completions use the configured model (fallback `gpt-3.5-turbo`).
- Centralised `buildOpenAIErrorMessage` helper normalises error output and adds guidance for common misconfigurations.

## Message Flow
### Storing a tweet
1. User starts capture in the popup → content agent scans the DOM.
2. Each new tweet is posted to the background agent → forwarded to `/api/store-tweet` with credentials.
3. Local analysis agent (server) initialises OpenAI (now resilient to URL variants), stores embeddings and tweet metadata immediately, and skips any per-tweet model calls. Questions pull the raw tweets directly from storage.
4. Background agent surfaces results, updates counters, and optionally shows notifications.

### Asking a question
1. Popup sends `askQuestion` to background agent with the user query.
2. Background forwards to `/api/query`; server embeds the query, retrieves the nearest tweets (vector similarity or keyword), applies timeframe and include/exclude keyword filters when present, and then composes an LLM prompt.
3. OpenAI returns an answer; server responds with the answer plus source snippets.
4. Popup displays the formatted response and sources section.

## Operational Notes
- Ensure `start_chromadb.py` (or `chroma run`) is active before using the full server; the simple server is a no-Chroma fallback.
- Both server flavours now reinitialise the OpenAI SDK whenever credentials change, so updating settings in the popup takes immediate effect.
- Errors surfaced to the popup contain actionable guidance (e.g., mis-pointed base URL, missing model access) instead of raw HTML bodies.
- Ports: server listens on 3001, Chroma (if used) on 8000. Adjust Chrome extension `SERVER_URL` (`background.js`) if you change ports.
