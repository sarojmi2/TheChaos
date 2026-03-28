# Chaos Bridge

Chaos Bridge is a Gemini-powered emergency orchestration app designed for societal benefit. It accepts messy, real-world inputs such as rushed voice transcripts, fragmented medical history, image evidence, traffic or weather context, and converts them into:

- structured incident summaries
- prioritized life-safety actions
- verification checks
- routing recommendations
- escalation triggers

## Why this fits the brief

The app acts as a universal bridge between human intent and complex systems:

- it accepts unstructured multimodal inputs
- Gemini converts them into structured JSON
- a second Gemini pass verifies the first pass
- deterministic safety rules add extra life-safety routing for medical, fire, chemical, and weather hazards
- the UI presents a handoff-ready action plan for responders

## Run locally

1. Set your Gemini key:

```bash
export GEMINI_API_KEY="your_key_here"
```

2. Optional model override:

```bash
export GEMINI_MODEL="gemini-2.0-flash"
```

3. Start the app:

```bash
npm start
```

4. Open `http://localhost:3000`

## Demo mode

If `GEMINI_API_KEY` is missing, the app still runs in demo mode and shows the full workflow with clear instructions for enabling live analysis.

## Architecture

- `server.js`: static file server plus `/api/analyze` and `/api/health`
- `public/index.html`: intake and response dashboard
- `public/app.js`: browser-side file encoding and API integration
- `public/styles.css`: responsive interface and visual system

## Example scenario

Paste something messy like:

> Elderly woman found semi-conscious outside a clinic after flash flooding. Family says she has kidney disease, missed dialysis, and is complaining of chest tightness. Roads are blocked and power is intermittent.

Then attach a photo of the scene or notes, submit, and the app will generate a structured response plan.
