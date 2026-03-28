const { buildDeterministicChecks, normalizeStructuredOutput } = require("./server");

describe("Chaos Bridge Core Logic Tests", () => {
  describe("normalizeStructuredOutput", () => {
    it("should provide safe fallbacks for empty inputs", () => {
      const output = normalizeStructuredOutput({});
      expect(output.severity).toBe("high");
      expect(output.hazards).toEqual([]);
      expect(output.confidence).toBe(0.5);
    });

    it("should sanitize arrays safely", () => {
      const output = normalizeStructuredOutput({
        hazards: ["fire", null, undefined, "smoke"]
      });
      expect(output.hazards).toEqual(["fire", "smoke"]);
    });
  });

  describe("buildDeterministicChecks", () => {
    const baseInput = {
      situation_summary: "",
      hazards: [],
      recommended_actions: [],
      routing: [],
      verification_checks: []
    };

    it("should prepend medical routing for unconscious patients", () => {
      const input = { ...baseInput, situation_summary: "Patient is unconscious and bleeding." };
      const result = buildDeterministicChecks(normalizeStructuredOutput(input));
      
      expect(result.routing[0]).toMatch(/Emergency Medical Services/i);
      expect(result.recommended_actions[0]).toMatch(/Call emergency medical services immediately/i);
      expect(result.verification_checks[0]).toMatch(/Confirm airway/i);
    });

    it("should prepend hazard routing for fire incidents", () => {
      const input = { ...baseInput, situation_summary: "There is a massive fire spreading." };
      const result = buildDeterministicChecks(normalizeStructuredOutput(input));
      
      expect(result.routing[0]).toMatch(/Fire Department/i);
      expect(result.recommended_actions[0]).toMatch(/Evacuate people/i);
      expect(result.verification_checks[0]).toMatch(/Verify whether there is active fire/i);
    });

    it("should append general safety checks if none matched", () => {
      const result = buildDeterministicChecks(normalizeStructuredOutput(baseInput));
      expect(result.routing).toContain("Local emergency coordination center");
      expect(result.recommended_actions[0]).toMatch(/Establish immediate safety/i);
    });
  });
});
