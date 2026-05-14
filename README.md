# Floo WhatsApp Node.js Server

Customer-facing WhatsApp conversation service for order intake, payment-link handoff, and Odoo event notifications.

## What this service does

- Receives incoming WhatsApp messages from Evolution API webhook.
- Detects customer in Odoo by phone number.
- Onboards unknown customer by asking name.
- Requires editable free-text address before checkout.
- Shows only WhatsApp-tagged products from Odoo.
- Builds cart and creates order + payment link in Odoo.
- Waits for Odoo webhook (`payment_paid`) and then sends invoice message.
- Sends morning delivery notification from Odoo webhook (`delivery_morning`) without invoice.

## Environment

Copy `.env.example` to `.env` and fill values.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t floo-whatsapp-nodejs-server .
```

## Webhook endpoints

- `POST /webhooks/whatsapp/messages/messages-upsert`
- `POST /webhooks/odoo`
- `GET /health/live`
- `GET /health/ready`

## Test endpoint

- `POST /test/send-message`
- `GET /test/evolution-ping`
- `GET /test/system-check`

Purpose:
- Sends a WhatsApp test message to `TEST_RECIPIENT_PHONE` (default `+6281357737545`).

Body (JSON):

```json
{
	"text": "Halo, ini pesan test"
}
```

Optional security:
- Set `TEST_ENDPOINT_KEY` in env.
- If set, request must include header `x-test-key: <your-key>`.

Diagnostic:
- `GET /test/evolution-ping` checks DNS and basic HTTP reachability to `EVOLUTION_API_URL` from inside the app container.
- `GET /test/system-check` checks database + Odoo auth + Evolution instance state in one endpoint.
