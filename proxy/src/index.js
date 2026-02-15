// ============================================================
//  AI Kontrollrom - Cloudflare Worker Proxy
//  
//  Denne workeren fungerer som losbaten mellom nettleseren
//  og de fire AI-havnene. Den tar imot foresporsler fra
//  grensesnittet, legger pa riktig autentisering, og
//  videresender til riktig API.
//
//  OPPSETT:
//  1. Opprett en Cloudflare-konto (gratis): https://dash.cloudflare.com
//  2. Installer Wrangler CLI: npm install -g wrangler
//  3. Logg inn: wrangler login
//  4. Legg inn API-noklene som secrets:
//       wrangler secret put ANTHROPIC_API_KEY
//       wrangler secret put OPENAI_API_KEY
//       wrangler secret put GEMINI_API_KEY
//       wrangler secret put MISTRAL_API_KEY
//       wrangler secret put ALLOWED_ORIGIN
//  5. Deploy: wrangler deploy
//
//  Etter deploy far du en URL som:
//    https://ai-kontrollrom-proxy.<ditt-brukernavn>.workers.dev
//  Lim denne inn i "Proxy-URL" feltet i grensesnittet.
// ============================================================

// Mapping fra rute til malkonfigurasjon
const ROUTES = {
  '/api/claude': {
    target: 'https://api.anthropic.com/v1/messages',
    keyEnv: 'ANTHROPIC_API_KEY',
    buildHeaders: (key) => ({
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    })
  },
  '/api/chatgpt': {
    target: 'https://api.openai.com/v1/chat/completions',
    keyEnv: 'OPENAI_API_KEY',
    buildHeaders: (key) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    })
  },
  '/api/gemini': {
    target: null, // Bygges dynamisk med API-nokkel i URL
    keyEnv: 'GEMINI_API_KEY',
    buildHeaders: () => ({
      'Content-Type': 'application/json'
    }),
    buildUrl: (key) =>
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`
  },
  '/api/mistral': {
    target: 'https://api.mistral.ai/v1/chat/completions',
    keyEnv: 'MISTRAL_API_KEY',
    buildHeaders: (key) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    })
  }
};

export default {
  async fetch(request, env) {
    // ----- CORS preflight -----
    if (request.method === 'OPTIONS') {
      return corsResponse(env, new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ----- Helsesjekk -----
    if (path === '/' || path === '/health') {
      return corsResponse(env, new Response(
        JSON.stringify({
          status: 'ok',
          routes: Object.keys(ROUTES),
          timestamp: new Date().toISOString()
        }),
        { headers: { 'Content-Type': 'application/json' } }
      ));
    }

    // ----- Finn riktig rute -----
    const route = ROUTES[path];
    if (!route) {
      return corsResponse(env, new Response(
        JSON.stringify({ error: `Ukjent rute: ${path}. Gyldige ruter: ${Object.keys(ROUTES).join(', ')}` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      ));
    }

    // ----- Valider origin -----
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    if (allowedOrigin !== '*' && !origin.includes(allowedOrigin)) {
      return new Response(
        JSON.stringify({ error: 'Origin ikke tillatt' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ----- Hent API-nokkel -----
    const apiKey = env[route.keyEnv];
    if (!apiKey) {
      return corsResponse(env, new Response(
        JSON.stringify({ error: `API-nokkel ${route.keyEnv} er ikke konfigurert. Kjor: wrangler secret put ${route.keyEnv}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      ));
    }

    // ----- Bygg og send foresporselen videre -----
    try {
      const targetUrl = route.buildUrl ? route.buildUrl(apiKey) : route.target;
      const headers = route.buildHeaders(apiKey);
      const body = await request.text();

      // Sjekk om klienten ber om streaming
      const bodyJson = JSON.parse(body);
      const isStreaming = bodyJson.stream === true;

      const upstreamResponse = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body
      });

      if (!upstreamResponse.ok) {
        const errorText = await upstreamResponse.text();
        return corsResponse(env, new Response(errorText, {
          status: upstreamResponse.status,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // For streaming: videresend som SSE
      if (isStreaming && upstreamResponse.body) {
        return corsResponse(env, new Response(upstreamResponse.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          }
        }));
      }

      // For vanlige svar: videresend JSON
      const responseData = await upstreamResponse.text();
      return corsResponse(env, new Response(responseData, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));

    } catch (err) {
      return corsResponse(env, new Response(
        JSON.stringify({ error: `Proxy-feil: ${err.message}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      ));
    }
  }
};

// ----- CORS-hjelpefunksjon -----
function corsResponse(env, response) {
  const allowedOrigin = env.ALLOWED_ORIGIN || '*';
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access');
  headers.set('Access-Control-Max-Age', '86400');

  return new Response(response.body, {
    status: response.status,
    headers
  });
}
