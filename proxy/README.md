# AI Kontrollrom - Oppsettguide

## Oversikt

Systemet bestar av to deler:

```
[Nettleser: multi-ai-chat.html]
         |
         v
[Cloudflare Worker: proxy]
     /    |    \     \
    v     v     v     v
Claude  GPT  Gemini  Mistral
```

Proxyen er losbaten som navigerer trafikken trygt mellom nettleseren og de fire AI-API-ene. Uten den blokkerer nettleserne foresporsler pga. CORS-regler.


## Steg 1: Skaff API-nokler

| Leverandor | Portal | Gratisniva |
|-----------|--------|------------|
| Anthropic (Claude) | https://console.anthropic.com | $5 startkreditt |
| OpenAI (ChatGPT) | https://platform.openai.com/api-keys | Betalingskort krevd |
| Google (Gemini) | https://aistudio.google.com/apikey | Generost gratisniva |
| Mistral | https://console.mistral.ai/api-keys | Gratisniva tilgjengelig |


## Steg 2: Installer Wrangler (Cloudflare CLI)

```bash
npm install -g wrangler
```


## Steg 3: Logg inn pa Cloudflare

```bash
wrangler login
```

Dette apner nettleseren for autentisering. Opprett en gratis konto om du ikke har en.


## Steg 4: Klon prosjektmappen

Kopier mappene `cloudflare-worker/` til din maskin. Strukturen ser slik ut:

```
cloudflare-worker/
  src/
    index.js      <-- Selve proxy-koden
  wrangler.toml   <-- Konfigurasjon
```


## Steg 5: Legg inn API-nokler som hemmeligheter

Kjor disse kommandoene og lim inn noklene nar du blir spurt:

```bash
cd cloudflare-worker

wrangler secret put ANTHROPIC_API_KEY
# Lim inn din Anthropic-nokkel

wrangler secret put OPENAI_API_KEY
# Lim inn din OpenAI-nokkel

wrangler secret put GEMINI_API_KEY
# Lim inn din Google AI-nokkel

wrangler secret put MISTRAL_API_KEY
# Lim inn din Mistral-nokkel
```

For a begrense hvem som kan bruke proxyen:

```bash
wrangler secret put ALLOWED_ORIGIN
# Skriv inn domenet der grensesnittet kjorer, f.eks.:
# https://kontrollrom.dittdomene.no
# Eller * for a tillate alle (kun for testing)
```


## Steg 6: Deploy

```bash
wrangler deploy
```

Du far tilbake en URL, typisk:
```
https://ai-kontrollrom-proxy.<ditt-brukernavn>.workers.dev
```


## Steg 7: Koble grensesnittet til proxyen

1. Apne `multi-ai-chat.html` i nettleseren
2. Klikk "API-nokler" oppe til hoyre
3. Lim inn Worker-URLen i "Proxy-URL" feltet
4. Lagre

Na vil alle foresporsler ga gjennom proxyen. Du trenger IKKE legge inn API-nokler i nettleseren nar du bruker proxy-modus.


## Hosting av grensesnittet

Grensesnittet er en enkel HTML-fil. Du kan:

- **Cloudflare Pages** (gratis): Last opp filen direkte
- **GitHub Pages**: Push til et repo og aktiver Pages
- **Lokal bruk**: Bare apne filen i nettleseren


## Feilsoking

**"CORS error" i konsollen:**
Sjekk at ALLOWED_ORIGIN matcher domenet du kjorer fra, eller er satt til *.

**"API-nokkel ikke konfigurert":**
Kjor `wrangler secret list` for a se hvilke hemmeligheter som er satt.

**Streaming fungerer ikke:**
OpenAI og Mistral streamer via SSE. Verifiser at proxyen videresender headere korrekt. Test med:
```bash
curl -X POST https://din-worker.workers.dev/api/chatgpt \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hei"}]}'
```

**Treg responstid:**
Cloudflare Workers har 30 sekunders tidsgrense pa gratis-planen. Lange AI-svar kan treffe denne. Oppgrader til Workers Paid ($5/mnd) for 15 minutter.


## Sikkerhet

- API-noklene lagres ALDRI i nettleseren i proxy-modus
- Bruk ALLOWED_ORIGIN for a begrense tilgang
- Vurder rate limiting via Cloudflare dashboard
- For produksjon: legg til autentisering (f.eks. en enkel bearer token)


## Kostnader

| Komponent | Kostnad |
|-----------|---------|
| Cloudflare Workers (gratis) | 100 000 forsporser/dag |
| Cloudflare Workers (betalt) | $5/mnd, 10M forsporser |
| AI-API-er | Varierer per leverandor |
