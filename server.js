const http = require("http");
const fs = require("fs");
const { Logging } = require('@google-cloud/logging');
const loggingClient = new Logging();
const requestLog = loggingClient.log('chaos-bridge-requests');

function writeCloudLog(req, severity, payload) {
  try {
    const entry = requestLog.entry(
      { resource: { type: 'global' }, severity },
      { method: req.method, url: req.url, payload }
    );
    requestLog.write(entry);
  } catch (e) {
    console.error(e);
  }
}
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Content-Security-Policy", "default-src 'self' data: https: fonts.googleapis.com fonts.gstatic.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; img-src 'self' data:; connect-src 'self' https://*.googleapis.com");
}

function sendJson(res, statusCode, payload) {
  applySecurityHeaders(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname === "/" ? "/index.html" : parsedUrl.pathname;
  pathname = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, "public", pathname);

  if (!filePath.startsWith(path.join(__dirname, "public"))) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    applySecurityHeaders(res);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.writeHead(200, { 
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": stat.size
    });

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
  });
}

function stripCodeFence(text) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractJson(text) {
  const cleaned = stripCodeFence(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function sanitizeArray(value, fallback = []) {
  return Array.isArray(value) ? value.filter(Boolean) : fallback;
}

function normalizeStructuredOutput(data) {
  return {
    situation_summary: data.situation_summary || "Unclear situation requiring rapid triage.",
    severity: data.severity || "high",
    confidence: Number(data.confidence || 0.5),
    intent: data.intent || "Stabilize the situation and coordinate response.",
    location: data.location || "Unknown",
    impacted_people: data.impacted_people || "Unknown",
    hazards: sanitizeArray(data.hazards),
    evidence: sanitizeArray(data.evidence),
    missing_information: sanitizeArray(data.missing_information),
    recommended_actions: sanitizeArray(data.recommended_actions),
    verification_checks: sanitizeArray(data.verification_checks),
    routing: sanitizeArray(data.routing),
    escalation_thresholds: sanitizeArray(data.escalation_thresholds),
    structured_inputs: {
      raw_channels: sanitizeArray(data.structured_inputs && data.structured_inputs.raw_channels),
      extracted_entities: sanitizeArray(data.structured_inputs && data.structured_inputs.extracted_entities),
      timeline: sanitizeArray(data.structured_inputs && data.structured_inputs.timeline),
      systems_involved: sanitizeArray(data.structured_inputs && data.structured_inputs.systems_involved),
    },
  };
}

function buildDeterministicChecks(analysis) {
  const actions = [...analysis.recommended_actions];
  const routing = [...analysis.routing];
  const verification = [...analysis.verification_checks];
  const hazards = analysis.hazards.join(" ").toLowerCase();
  const summary = analysis.situation_summary.toLowerCase();
  const combined = `${hazards} ${summary}`;

  if (/(bleeding|unconscious|stroke|heart|seizure|can.t breathe|not breathing|chest pain)/.test(combined)) {
    actions.unshift("Call emergency medical services immediately and prepare a concise patient handoff.");
    routing.unshift("Emergency Medical Services");
    verification.unshift("Confirm airway, breathing, circulation, level of consciousness, and time of symptom onset.");
  }

  if (/(fire|smoke|gas leak|explosion|chemical|toxic)/.test(combined)) {
    actions.unshift("Evacuate people from the hazard zone and isolate ignition or contamination sources if safe.");
    routing.unshift("Fire Department / Hazardous Materials");
    verification.unshift("Verify whether there is active fire, smoke spread, chemical exposure, or trapped occupants.");
  }

  if (/(flood|storm|hurricane|landslide|earthquake|traffic|road block)/.test(combined)) {
    routing.push("Municipal Incident Command / Transit Authority");
    verification.push("Cross-check road access, weather exposure, and safe evacuation routes before dispatch.");
  }

  if (!actions.length) {
    actions.push("Establish immediate safety, identify the highest-risk person or system, and escalate to the relevant responder.");
  }

  if (!routing.length) {
    routing.push("Local emergency coordination center");
  }

  return {
    recommended_actions: [...new Set(actions)].slice(0, 6),
    routing: [...new Set(routing)].slice(0, 5),
    verification_checks: [...new Set(verification)].slice(0, 6),
  };
}

const { GoogleAuth } = require('google-auth-library');
let authClient;

async function getGeminiCredentials() {
  if (!authClient) {
    authClient = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform'
    });
  }
  
  const client = await authClient.getClient();
  const tokenInfo = await client.getAccessToken();
  return tokenInfo.token;
}

async function callGemini(payload) {
  const token = await getGeminiCredentials();
  
  const PROJECT_ID = "gen-lang-client-0373787555";
  const LOCATION = "us-central1"; // Vertex standard region
  
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const text =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  if (!text) {
    throw new Error("Gemini response did not include text.");
  }

  return text;
}

function buildAnalysisPrompt(input) {
  return `
You are a crisis-grade orchestration model called Chaos Bridge.
Your job is to convert messy, multimodal real-world input into a verified structured action plan for societal benefit.

Rules:
- Treat all inputs as imperfect and noisy.
- Infer carefully, but separate evidence from assumptions.
- Prioritize life safety, then stabilization, then routing to the correct institutions.
- Return JSON only.
- Do not include markdown fences.

Schema:
{
  "situation_summary": "string",
  "severity": "low|moderate|high|critical",
  "confidence": 0.0,
  "intent": "string",
  "location": "string",
  "impacted_people": "string",
  "hazards": ["string"],
  "evidence": ["string"],
  "missing_information": ["string"],
  "recommended_actions": ["string"],
  "verification_checks": ["string"],
  "routing": ["string"],
  "escalation_thresholds": ["string"],
  "structured_inputs": {
    "raw_channels": ["string"],
    "extracted_entities": ["string"],
    "timeline": ["string"],
    "systems_involved": ["string"]
  }
}

Messy input package:
${JSON.stringify(input, null, 2)}
`.trim();
}

function buildVerificationPrompt(originalInput, analysis) {
  return `
You are the verification layer for Chaos Bridge.
Review the original input and the first-pass structured analysis.

Task:
- Identify unsupported claims.
- Tighten vague instructions.
- Preserve urgency where appropriate.
- Return the same JSON schema only.
- If information is uncertain, lower confidence and move details into missing_information.

Original input:
${JSON.stringify(originalInput, null, 2)}

First-pass analysis:
${JSON.stringify(analysis, null, 2)}
`.trim();
}

async function analyzeInput(input) {
  let canAuth = !!GEMINI_API_KEY;
  if (!canAuth) {
    try {
      await getGeminiCredentials();
      canAuth = true;
    } catch(e) {}
  }

  if (!canAuth) {
    return {
      demo_mode: true,
      structured: {
        situation_summary:
          "Demo mode active. The app is ready, but a GEMINI_API_KEY is required for live analysis.",
        severity: "moderate",
        confidence: 0.21,
        intent: "Translate messy multimodal input into a verified response plan.",
        location: input.locationHint || "Not provided",
        impacted_people: "Unknown",
        hazards: ["Live Gemini verification is unavailable in demo mode."],
        evidence: [
          "User interface captured the requested channels and raw incident narrative.",
          "Backend is prepared to send multimodal incident data to Gemini.",
        ],
        missing_information: [
          "Set GEMINI_API_KEY in the environment to enable real model output.",
          "Provide time, location, symptoms, and available responders for higher-confidence routing.",
        ],
        recommended_actions: [
          "Add a Gemini API key and rerun the scenario.",
          "Use the raw input pack to simulate intake and handoff workflows.",
        ],
        verification_checks: [
          "Confirm the source, time, and location of the incident.",
          "Cross-check whether there is immediate danger to life.",
        ],
        routing: ["Emergency coordinator", "Medical intake desk", "Municipal response team"],
        escalation_thresholds: [
          "Escalate immediately if there is airway compromise, fire, toxic exposure, or structural danger.",
        ],
        structured_inputs: {
          raw_channels: input.signalTypes || [],
          extracted_entities: ["Demo mode"],
          timeline: ["Awaiting live Gemini analysis"],
          systems_involved: ["Healthcare", "Emergency response", "Public infrastructure"],
        },
      },
    };
  }

  const inlineParts = sanitizeArray(input.files).map((file) => ({
    inline_data: {
      mime_type: file.mimeType || "image/jpeg",
      data: file.base64Data,
    },
  }));

  const analysisPrompt = buildAnalysisPrompt(input);
  const firstPassText = await callGemini({
    contents: [
      {
        parts: [{ text: analysisPrompt }, ...inlineParts],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const firstPass = normalizeStructuredOutput(extractJson(firstPassText));

  const verificationPrompt = buildVerificationPrompt(input, firstPass);
  const verifiedText = await callGemini({
    contents: [
      {
        parts: [{ text: verificationPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const verified = normalizeStructuredOutput(extractJson(verifiedText));
  const deterministic = buildDeterministicChecks(verified);

  return {
    demo_mode: false,
    structured: {
      ...verified,
      recommended_actions: deterministic.recommended_actions,
      routing: deterministic.routing,
      verification_checks: deterministic.verification_checks,
    },
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    applySecurityHeaders(res);
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.url === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      model: GEMINI_MODEL,
      geminiConfigured: Boolean(GEMINI_API_KEY),
    });
    return;
  }

  if (req.url === "/api/analyze" && req.method === "POST") {
    try {
      const rawBody = await readBody(req);
      const body = JSON.parse(rawBody);
      const result = await analyzeInput(body);
      writeCloudLog(req, 'INFO', { action: 'analyze', success: true });
      sendJson(res, 200, result);
    } catch (error) {
      writeCloudLog(req, 'ERROR', { action: 'analyze', success: false, error: error.message });
      const statusCode = error.message === "Payload too large" ? 413 : 500;
      sendJson(res, statusCode, {
        error: "Analysis failed",
        detail: error.message,
      });
    }
    return;
  }

  serveStatic(req, res);
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Chaos Bridge listening on http://${HOST}:${PORT}`);
  });
}

module.exports = { server, buildDeterministicChecks, normalizeStructuredOutput };
