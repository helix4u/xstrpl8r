# Agents

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
- Surfaces notable results (high toxicity/bot likelihood) through Chrome notifications and keeps popup counters in sync.
- Critical functions: `analyzeTweet()`, `askQuestion()`, `showNotification()`.

## Local Analysis Agent
### Full Chroma-backed server (`server/server.js`)
- Hosts REST endpoints for storing tweets, querying via embeddings, tracking stats, and health checks.
- Manages an embedded Chroma collection (`x_tweets`) and caches OpenAI config to avoid redundant client creation.
- Workflow: generate embedding → run analysis completions → persist tweet metadata/embedding → respond with analysis payloads.
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
1. User starts analysis in the popup → content agent scans the DOM.
2. Each new tweet is posted to the background agent → forwarded to `/api/store-tweet` with credentials.
3. Local analysis agent (server) initialises OpenAI (now resilient to URL variants), generates embeddings & analysis, saves metadata (Chroma or RAM), and returns scores.
4. Background agent surfaces results, updates counters, and optionally shows notifications.

### Asking a question
1. Popup sends `askQuestion` to background agent with the user query.
2. Background forwards to `/api/query`; server embeds the query, retrieves nearest tweets (vector similarity or keyword), and composes an LLM prompt.
3. OpenAI returns an answer; server responds with the answer plus source snippets.
4. Popup displays the formatted response and sources section.

## Operational Notes
- Ensure `start_chromadb.py` (or `chroma run`) is active before using the full server; the simple server is a no-Chroma fallback.
- Both server flavours now reinitialise the OpenAI SDK whenever credentials change, so updating settings in the popup takes immediate effect.
- Errors surfaced to the popup contain actionable guidance (e.g., mis-pointed base URL, missing model access) instead of raw HTML bodies.
- Ports: server listens on 3001, Chroma (if used) on 8000. Adjust Chrome extension `SERVER_URL` (`background.js`) if you change ports.
