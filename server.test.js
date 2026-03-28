"use strict";

const { buildDeterministicChecks, normalizeStructuredOutput } = require("./server");

// ── normalizeStructuredOutput ─────────────────────────────────────────────────

describe("normalizeStructuredOutput", () => {
  test("fills all defaults when given an empty object", () => {
    const result = normalizeStructuredOutput({});
    expect(result.situation_summary).toBe("Unclear situation requiring rapid triage.");
    expect(result.severity).toBe("high");
    expect(result.confidence).toBe(0.5);
    expect(result.intent).toBe("Stabilize the situation and coordinate response.");
    expect(result.location).toBe("Unknown");
    expect(result.impacted_people).toBe("Unknown");
    expect(Array.isArray(result.hazards)).toBe(true);
    expect(Array.isArray(result.evidence)).toBe(true);
    expect(Array.isArray(result.missing_information)).toBe(true);
    expect(Array.isArray(result.recommended_actions)).toBe(true);
    expect(Array.isArray(result.verification_checks)).toBe(true);
    expect(Array.isArray(result.routing)).toBe(true);
    expect(Array.isArray(result.escalation_thresholds)).toBe(true);
  });

  test("preserves provided string fields", () => {
    const result = normalizeStructuredOutput({
      situation_summary: "Building fire on 3rd floor.",
      severity: "critical",
      confidence: 0.9,
      location: "Block B, Floor 3",
    });
    expect(result.situation_summary).toBe("Building fire on 3rd floor.");
    expect(result.severity).toBe("critical");
    expect(result.confidence).toBe(0.9);
    expect(result.location).toBe("Block B, Floor 3");
  });

  test("filters falsy values from arrays", () => {
    const result = normalizeStructuredOutput({
      hazards: ["fire", null, undefined, "", "smoke"],
    });
    expect(result.hazards).toEqual(["fire", "smoke"]);
  });

  test("replaces non-array fields with empty array fallback", () => {
    const result = normalizeStructuredOutput({ hazards: "not an array", routing: 42 });
    expect(result.hazards).toEqual([]);
    expect(result.routing).toEqual([]);
  });

  test("normalizes nested structured_inputs with defaults", () => {
    const result = normalizeStructuredOutput({});
    expect(result.structured_inputs).toEqual({
      raw_channels: [],
      extracted_entities: [],
      timeline: [],
      systems_involved: [],
    });
  });

  test("preserves valid nested structured_inputs arrays", () => {
    const result = normalizeStructuredOutput({
      structured_inputs: {
        raw_channels: ["voice", "photo"],
        extracted_entities: ["John Doe"],
        timeline: ["12:00 collapse"],
        systems_involved: ["EMS"],
      },
    });
    expect(result.structured_inputs.raw_channels).toEqual(["voice", "photo"]);
    expect(result.structured_inputs.extracted_entities).toEqual(["John Doe"]);
  });

  test("coerces confidence string to Number", () => {
    const result = normalizeStructuredOutput({ confidence: "0.75" });
    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBe(0.75);
  });

  test("handles missing structured_inputs gracefully", () => {
    const result = normalizeStructuredOutput({ structured_inputs: null });
    expect(result.structured_inputs.raw_channels).toEqual([]);
  });
});

// ── buildDeterministicChecks ──────────────────────────────────────────────────

describe("buildDeterministicChecks", () => {
  function base(overrides = {}) {
    return {
      recommended_actions: [],
      routing: [],
      verification_checks: [],
      hazards: [],
      situation_summary: "",
      ...overrides,
    };
  }

  test("injects medical response for chest pain in summary", () => {
    const result = buildDeterministicChecks(base({ situation_summary: "patient has chest pain" }));
    expect(result.recommended_actions[0]).toMatch(/emergency medical services/i);
    expect(result.routing[0]).toBe("Emergency Medical Services");
    expect(result.verification_checks[0]).toMatch(/airway/i);
  });

  test("injects medical response for 'unconscious' keyword", () => {
    const result = buildDeterministicChecks(base({ situation_summary: "victim is unconscious" }));
    expect(result.recommended_actions[0]).toMatch(/emergency medical services/i);
  });

  test("injects medical response for 'not breathing' keyword", () => {
    const result = buildDeterministicChecks(base({ situation_summary: "caller says he is not breathing" }));
    expect(result.routing).toContain("Emergency Medical Services");
  });

  test("injects fire/hazmat response for smoke in hazards", () => {
    const result = buildDeterministicChecks(base({ hazards: ["heavy smoke detected"] }));
    expect(result.recommended_actions[0]).toMatch(/evacuate/i);
    expect(result.routing[0]).toMatch(/fire/i);
  });

  test("injects fire/hazmat for chemical keyword in summary", () => {
    const result = buildDeterministicChecks(base({ situation_summary: "chemical spill in warehouse" }));
    expect(result.routing).toContain("Fire Department / Hazardous Materials");
  });

  test("injects municipal routing for flood keyword", () => {
    const result = buildDeterministicChecks(base({ situation_summary: "flash flood cutting off road access" }));
    expect(result.routing).toContain("Municipal Incident Command / Transit Authority");
    expect(result.verification_checks.some((v) => /road access/i.test(v))).toBe(true);
  });

  test("injects municipal routing for earthquake keyword", () => {
    const result = buildDeterministicChecks(base({ situation_summary: "earthquake collapse of building" }));
    expect(result.routing).toContain("Municipal Incident Command / Transit Authority");
  });

  test("adds fallback action when no keywords match", () => {
    const result = buildDeterministicChecks(base({ situation_summary: "unclear situation" }));
    expect(result.recommended_actions.length).toBeGreaterThan(0);
    expect(result.recommended_actions[0]).toMatch(/Establish immediate safety/i);
  });

  test("adds fallback routing when no routing generated", () => {
    const result = buildDeterministicChecks(base({ situation_summary: "unclear" }));
    expect(result.routing).toContain("Local emergency coordination center");
  });

  test("deduplicates repeated actions", () => {
    const repeated = "Call emergency medical services immediately and prepare a concise patient handoff.";
    const result = buildDeterministicChecks(
      base({ situation_summary: "chest pain", recommended_actions: [repeated] })
    );
    expect(result.recommended_actions.filter((a) => a === repeated)).toHaveLength(1);
  });

  test("caps recommended_actions at 6", () => {
    const result = buildDeterministicChecks(
      base({ recommended_actions: ["a", "b", "c", "d", "e", "f", "g"], situation_summary: "chest pain" })
    );
    expect(result.recommended_actions.length).toBeLessThanOrEqual(6);
  });

  test("caps routing at 5", () => {
    const result = buildDeterministicChecks(
      base({ routing: ["r1", "r2", "r3", "r4", "r5", "r6"], situation_summary: "flood and chemical spill" })
    );
    expect(result.routing.length).toBeLessThanOrEqual(5);
  });

  test("caps verification_checks at 6", () => {
    const result = buildDeterministicChecks(
      base({ verification_checks: ["v1", "v2", "v3", "v4", "v5", "v6", "v7"], situation_summary: "chest pain near fire" })
    );
    expect(result.verification_checks.length).toBeLessThanOrEqual(6);
  });

  test("preserves existing actions when no keyword matches", () => {
    const result = buildDeterministicChecks(
      base({ recommended_actions: ["Secure the perimeter."], situation_summary: "routine check" })
    );
    expect(result.recommended_actions).toContain("Secure the perimeter.");
  });

  test("returns all three keys in output", () => {
    const result = buildDeterministicChecks(base());
    expect(result).toHaveProperty("recommended_actions");
    expect(result).toHaveProperty("routing");
    expect(result).toHaveProperty("verification_checks");
  });
});
