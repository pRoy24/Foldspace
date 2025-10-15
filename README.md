## Foldspace

Foldspace is (WIP) EthOnline 2025 submission that wires Coinbase's X402 payment rails directly into the SamsarOne T2V (text-to-video) API. It quotes, collects, and verifies machine-to-machine payments before forwarding creative requests to SamsarOne.

---

### Why Foldspace?
- End-to-end facilitator that can verify and settle payments on- or off-chain.
- Drop-in Express web service with authenticated facilitator endpoints.
- Typed orchestration helpers for quoting, paying, and submitting SamsarOne T2V jobs.
- Configuration-first: point at the networks and assets you have enabled for your X402 credentials.

---

### Architecture Highlights
- **`src/services/T2VOrchestrator.ts`**  
  Builds quotes, payment requirements, payment headers, and wraps SamsarOne submission + status polling.
- **`src/services/X402FacilitatorService.ts`**  
  Bridges to the Coinbase X402 facilitator or performs local on-chain verification/settlement with a signer key.
- **`src/services/T2VApiClient.ts`**  
  Minimal HTTP client for `POST /create` and `GET /status` SamsarOne endpoints.
- **`src/services/AgentverseClient.ts`**  
  Registers agents with Agentverse `POST /v1/agents`.
- **`src/services/ServerConnect.ts`** & **`src/server.ts`**  
  Express router exposing `/facilitator/*` and `/payments/*` routes, optionally guarded by an `Authorization` header.
- **`src/config`**  
  Builders for facilitator, T2V API, payment, and Agentverse configuration sourced from environment variables.

---

### Quick Start
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment** (see tables below). At minimum you must supply a SamsarOne API key and an X402 facilitator credential or override URL.
3. **Run in development**
   ```bash
   npm run dev
   ```
   This starts the Express server on `PORT` (defaults to `3000`) with auto-reload.
4. **Build for production**
   ```bash
   npm run build
   npm run start
   ```

---

### Environment Configuration
You need to provision a SamsarOne API key and request X402 API credentials from Coinbase. In your Coinbase CDP dashboard, enable every network you want Foldspace to settle on; only enabled networks can be used for `PaymentRequirements.network`.

#### Core Variables
| Variable | Description |
| --- | --- |
| `CDP_API_KEY_ID` | X402 facilitator API key ID from Coinbase. Optional if you exclusively hit the public facilitator URL. |
| `CDP_API_KEY_SECRET` | X402 facilitator API secret. Required when `CDP_API_KEY_ID` is set. |
| `X402_FACILITATOR_URL` | Optional override for the facilitator base URL. |
| `X402_PRIVATE_KEY` | Hex-encoded signer used for on-chain settlement; prepend `0x` if missing. |
| `X402_DEFAULT_NETWORK` | Default network used when requirements do not specify one. |
| `T2V_API_KEY` | SamsarOne API key (required). |
| `T2V_BASE_URL` | Override for SamsarOne API base URL. Defaults to `https://api.samsar.one/v1/video/`. |
| `T2V_PAY_TO` | Destination address to receive payments for SamsarOne jobs. |
| `T2V_ASSET` | Asset identifier accepted by the facilitator (e.g. `usdc`). |
| `T2V_NETWORK` | Default payment network (one of the supported networks listed below). |
| `T2V_PRICE_PER_CREDIT_MINOR_UNITS` | Price per credit in minor units (string, number, or bigint). Defaults to `10000`. |
| `T2V_RESOURCE` | Optional resource identifier shared with the facilitator. Defaults to the `/create` endpoint URL. |
| `T2V_DESCRIPTION` | Friendly label embedded in payment requirements. |
| `T2V_MIME_TYPE` | MIME type for the payment payload; defaults to `application/json`. |
| `T2V_MAX_TIMEOUT_SECONDS` | Maximum facilitator timeout before expiring a payment (defaults to `600`). |

#### Agentverse Integration
| Variable | Description |
| --- | --- |
| `AGENTVERSE_API_KEY` | Agentverse bearer token used for `POST /v1/agents` registration (required to enable Agentverse routes). |
| `AGENTVERSE_BASE_URL` | Optional override for the Agentverse API base URL. Defaults to `https://agentverse.ai/`. |
| `AGENTVERSE_DEFAULT_AGENT_TYPE` | Default agent type (`mailbox`, `proxy`, or `custom`) applied when the request omits `agentType`. |
| `AGENTVERSE_DEFAULT_PREFIX` | Default registration prefix (`agent` or `test-agent`). |
| `AGENTVERSE_DEFAULT_ENDPOINT` | Default callback endpoint included in registration payloads when `endpoint` is omitted. |

#### Runtime Only
| Variable | Description |
| --- | --- |
| `PORT` | HTTP port for the Express server (default `3000`). |
| `REQUIRE_AUTHORIZATION` | Set to `false` to disable the default auth guard on facilitator routes. |

---

### Supported Payment Networks
Foldspace validates network inputs against the following list by default:
```
base-sepolia, base, avalanche-fuji, avalanche, iotex,
solana-devnet, solana, sei, sei-testnet, polygon,
polygon-amoy, peaq
```
Ensure each target network is enabled for your X402 project before deploying.

---

### Web Service Endpoints
All routes are mounted at `/` by `src/server.ts` and require a Bearer `Authorization` header unless `REQUIRE_AUTHORIZATION=false`.

| Method & Path | Description |
| --- | --- |
| `GET /` | Simple readiness message (`Foldspace Protocol proxy is up.`). |
| `GET /health` | Public health check returning `{ status: "ok" }`. |
| `POST /facilitator/resources` | Proxies `list` to the facilitator (body: `{ request }`). |
| `GET /facilitator/supported` | Returns the facilitator-supported payment kinds. |
| `POST /payments/verify` | Calls facilitator `verify` for provided payload/requirements. |
| `POST /payments/settle` | Calls facilitator `settle`. |
| `POST /payments/verify/onchain` | Performs local on-chain verification. |
| `POST /payments/settle/onchain` | Performs local on-chain settlement using the configured signer. |
| `POST /agentverse/register` | Registers an agent with Agentverse using the configured API credentials. |

---

### T2V Orchestration Flow
The `T2VOrchestrator` service streamlines paid submissions:
1. **Quote** - Call `quote(input)` to compute credit usage and target cost (`totalMinorUnits`).
2. **Build requirements** - Use `buildPaymentRequirement(quote, overrides)` to align facilitator metadata with SamsarOne expectations.
3. **Create payment header** - `createPaymentSession(signer, input)` returns a ready-to-use header and session metadata by building on `X402PaymentBuilder`.
4. **Verify & settle** - `submitPaidRequest` optionally runs facilitator or on-chain verification/settlement before posting to the SamsarOne `/create` endpoint.
5. **Track status** - `getStatus(requestId)` polls job progress or completion URLs.

---

### Project Structure
```
src/
  config/        // Environment-driven builders for facilitator, T2V, and Agentverse settings
  models/        // Type-safe interfaces for payments, T2V payloads, and Agentverse requests
  services/      // Core business logic (facilitator wrapper, orchestrator, HTTP clients)
  server.ts      // Express server bootstrap
  index.ts       // Library entry point exporting configs and services
```

---

### Development Scripts
- `npm run dev` - Start the Express server with hot reload.
- `npm run build` - Compile TypeScript to `dist/`.
- `npm run start` - Run the compiled server.
- `npm run typecheck` - Run TypeScript in no-emit mode.
- `npm run clean` - Remove build artifacts.

---

### Contributing
PRs and issues are welcome! Please ensure changes pass `npm run typecheck` and include any relevant updates to documentation or environment notes.

---

Foldspace is built for EthOnline 2025 - see you in the metaverse.
