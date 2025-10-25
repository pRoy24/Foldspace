# Foldspace X402 Proxy

This standalone Express server wraps the SamsarOne `/create` endpoint with an x402 paywall. Requests to `/create` return a `402 Payment Required` response that contains Coinbase x402 payment requirements. Each request is persisted so the service can verify payments and forward the original payload to `docs.samsar.one` once the configured wallet receives funds.

## Features
- `POST /create` – records the SamsarOne payload, emits an x402-compliant paywall response, and tracks the pending session.
- Wallet listener webhook – `POST /wallet/events` accepts facilitator/webhook notifications to verify payment payloads and update the session.
- Automatic forwarding – once payment verification succeeds, the server posts the stored payload to `https://api.samsar.one/v1/video/create` (override with `SAMSAR_BASE_URL`).
- Session APIs – list sessions or fetch a single session to inspect payment state, payload, and SamsarOne metadata.

## Getting Started
1. Install dependencies inside this directory:
   ```bash
   cd proxy
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in the required values (Coinbase x402 credentials, SamsarOne API key, payment destination, etc.).
3. Run the proxy:
   ```bash
   npm run dev
   ```
4. Call `POST /create` with the SamsarOne payload. The response body will contain `x402Version`, `accepts`, and a `sessionId` that you should include in your wallet/facilitator callback.
5. Configure your wallet or facilitator to `POST /wallet/events` with the `sessionId`, `paymentPayload`, and `paymentRequirements` once the transfer has settled. The proxy verifies the payment, marks the session as paid, and forwards the stored payload to SamsarOne.

## Environment Variables
See `.env.example` for the full list. Key fields:
- `PAYMENT_PAY_TO`, `PAYMENT_ASSET`, `PAYMENT_NETWORK` – describe where users must send funds.
- `PROXY_PRICE_MINOR_UNITS` – flat fee (minor units) charged for each `/create` call.
- `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` – Coinbase facilitator credentials to verify payments.
- `SAMSAR_API_KEY` – API key used when forwarding the job to SamsarOne.
- `WALLET_WEBHOOK_SECRET` – optional shared secret to secure wallet callbacks.

## Endpoints
- `GET /health` → `{ status: "ok" }`
- `POST /create` → `402` response with `accepts` requirements; persists session.
- `POST /wallet/events` → verifies wallet payloads and forwards paid requests.
- `GET /sessions` → returns every recorded session.
- `GET /sessions/:sessionId` → returns a single session.

## Development Notes
- The service stores session data in `proxy-data/sessions.json` by default. Override via `PROXY_DB_FILE`.
- Payment verification uses Coinbase's facilitator API; configure `X402_FACILITATOR_URL` to point at a custom host if needed.
- Set `AUTO_SUBMIT_ON_PAYMENT=false` when you want to decouple payment settlement from forwarding to SamsarOne.
