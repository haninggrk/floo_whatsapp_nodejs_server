import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/index.js';

interface SimulateBody {
  password?: string;
  paymentRequestId?: string;
}

function normalizePaymentRequestId(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';

  if (/^pr-[a-zA-Z0-9-]{10,}$/.test(raw)) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const candidates: string[] = [];

    for (const part of url.pathname.split('/')) {
      if (part) candidates.push(part);
    }
    for (const value of url.searchParams.values()) {
      if (value) candidates.push(value);
    }

    for (const candidate of candidates) {
      if (/^pr-[a-zA-Z0-9-]{10,}$/.test(candidate)) {
        return candidate;
      }
    }
  } catch {
    // Input is not URL and not valid payment request id.
  }

  return '';
}

function renderSimPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Xendit Test Simulate</title>
  <style>
    :root {
      --bg: #0f1a13;
      --card: #15241b;
      --line: #2c4235;
      --ink: #dfeee3;
      --muted: #9bb5a3;
      --brand: #2f7a4f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }
    .card {
      width: min(760px, 100%);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
    }
    .head {
      padding: 14px 16px;
      font-weight: 700;
      background: #1d3428;
      border-bottom: 1px solid var(--line);
    }
    form {
      padding: 16px;
      display: grid;
      gap: 12px;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      color: var(--muted);
      font-weight: 600;
    }
    input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: #101c15;
      color: var(--ink);
      outline: none;
    }
    input:focus {
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(47, 122, 79, 0.2);
    }
    button {
      border: 0;
      border-radius: 10px;
      background: var(--brand);
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      padding: 11px 14px;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.75;
      cursor: not-allowed;
    }
    .muted {
      font-size: 12px;
      color: var(--muted);
    }
    pre {
      margin: 0;
      padding: 16px;
      border-top: 1px solid var(--line);
      background: #0b1410;
      color: #d3e9d9;
      font-size: 12px;
      overflow: auto;
      max-height: 300px;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <main class="card">
    <section class="head">Xendit Test Payment Simulator</section>
    <form id="simForm">
      <label>Password
        <input id="password" type="password" required />
      </label>
      <label>Payment Request ID
        <input id="paymentRequestId" type="text" placeholder="pr-... atau URL checkout yang berisi pr-..." required />
      </label>
      <button id="runBtn" type="submit">Simulate Full Payment</button>
      <div class="muted">Endpoint: POST /v3/payment_requests/{payment_request_id}/simulate (api-version 2024-11-11)</div>
    </form>
    <pre id="result">Ready.</pre>
  </main>

  <script>
    const form = document.getElementById('simForm');
    const runBtn = document.getElementById('runBtn');
    const result = document.getElementById('result');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      runBtn.disabled = true;
      result.textContent = 'Running simulation...';

      const payload = {
        password: document.getElementById('password').value,
        paymentRequestId: document.getElementById('paymentRequestId').value.trim(),
      };

      try {
        const response = await fetch('/test/xendit-simulate/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const json = await response.json();
        result.textContent = JSON.stringify({
          http_status: response.status,
          ...json,
        }, null, 2);
      } catch (error) {
        result.textContent = String(error && error.message ? error.message : error);
      } finally {
        runBtn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

function basicAuth(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

export async function xenditSimulateRoutes(
  app: FastifyInstance,
  opts: { config: AppConfig },
): Promise<void> {
  app.get('/test/xendit-simulate', async (_request, reply) => {
    reply.type('text/html').send(renderSimPage());
  });

  app.post<{ Body: SimulateBody }>('/test/xendit-simulate/run', async (request, reply) => {
    const body = request.body || {};
    const password = String(body.password || '');
    const paymentRequestId = normalizePaymentRequestId(String(body.paymentRequestId || ''));

    if (!opts.config.SIMULATE_PAGE_PASSWORD) {
      reply.status(503).send({
        ok: false,
        message: 'SIMULATE_PAGE_PASSWORD is not configured.',
      });
      return;
    }

    if (password !== opts.config.SIMULATE_PAGE_PASSWORD) {
      reply.status(401).send({
        ok: false,
        message: 'Invalid password.',
      });
      return;
    }

    if (!paymentRequestId || paymentRequestId.length < 10) {
      reply.status(400).send({
        ok: false,
        message: 'payment_request_id harus format pr-... . URL checkout seperti /web/<token> tidak cukup jika tidak mengandung pr-... .',
      });
      return;
    }

    if (!opts.config.XENDIT_SECRET_KEY_TEST) {
      reply.status(503).send({
        ok: false,
        message: 'XENDIT_SECRET_KEY_TEST is not configured.',
      });
      return;
    }

    const endpoint = `${opts.config.XENDIT_API_URL}/v3/payment_requests/${encodeURIComponent(paymentRequestId)}/simulate`;

    let upstreamStatus = 500;
    let upstreamBodyText = '';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: basicAuth(opts.config.XENDIT_SECRET_KEY_TEST),
          'Content-Type': 'application/json',
          'api-version': '2024-11-11',
        },
        body: JSON.stringify({}),
      });

      upstreamStatus = response.status;
      upstreamBodyText = await response.text();
    } catch (error) {
      const err = error as Error;
      reply.status(502).send({
        ok: false,
        message: err.message,
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(upstreamBodyText);
    } catch {
      parsed = upstreamBodyText;
    }

    reply.status(200).send({
      ok: upstreamStatus >= 200 && upstreamStatus < 300,
      xendit_status: upstreamStatus,
      response: parsed,
    });
  });
}
