const form = document.getElementById("incident-form");
const fileInput = document.getElementById("imageFiles");
const fileList = document.getElementById("file-list");
const statusCard = document.getElementById("status-card");
const results = document.getElementById("results");

const state = {
  files: [],
};

function renderFileList() {
  if (!state.files.length) {
    fileList.innerHTML = '<p class="helper-text">No images attached yet.</p>';
    return;
  }

  fileList.innerHTML = state.files
    .map(
      (file) => `
        <div class="file-chip">
          <span>${file.name}</span>
          <small>${Math.round(file.size / 1024)} KB</small>
        </div>
      `
    )
    .join("");
}

function setStatus(message, tone = "neutral") {
  statusCard.className = `status-card ${tone}`;
  statusCard.innerHTML = `<p>${message}</p>`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64Data = String(result).split(",")[1];
      resolve({
        name: file.name,
        mimeType: file.type || "image/jpeg",
        size: file.size,
        base64Data,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getSignalTypes() {
  return Array.from(document.querySelectorAll('input[name="signalTypes"]:checked')).map((input) => input.value);
}

function renderList(id, items) {
  const element = document.getElementById(id);
  element.innerHTML = (items && items.length ? items : ["No items available."])
    .map((item) => `<li>${item}</li>`)
    .join("");
}

function renderResult(structured, demoMode) {
  results.classList.remove("hidden");
  document.getElementById("situation-summary").textContent = structured.situation_summary;
  document.getElementById("confidence").textContent = `${Math.round((structured.confidence || 0) * 100)}%`;

  const severityPill = document.getElementById("severity-pill");
  severityPill.textContent = structured.severity;
  severityPill.dataset.severity = structured.severity;

  renderList("actions", structured.recommended_actions);
  renderList("verification", structured.verification_checks);
  renderList("routing", structured.routing);
  renderList("hazards", structured.hazards);
  renderList("evidence", structured.evidence);
  renderList("missing", structured.missing_information);
  renderList("entities", structured.structured_inputs.extracted_entities);
  renderList("timeline", structured.structured_inputs.timeline);

  if (demoMode) {
    setStatus("Demo mode response generated. Add GEMINI_API_KEY for live multimodal reasoning.", "warning");
  } else {
    setStatus("Live Gemini analysis complete. Response package is ready for handoff.", "success");
  }
}

fileInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  state.files = await Promise.all(files.map(readFileAsBase64));
  renderFileList();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  results.classList.add("hidden");
  setStatus("Analyzing messy input, extracting signal, and verifying a response plan...", "loading");

  const payload = {
    rawInput: document.getElementById("rawInput").value.trim(),
    intent: document.getElementById("intent").value.trim(),
    locationHint: document.getElementById("locationHint").value.trim(),
    operatorNotes: document.getElementById("operatorNotes").value.trim(),
    signalTypes: getSignalTypes(),
    files: state.files,
    submittedAt: new Date().toISOString(),
  };

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || data.error || "Unknown server error");
    }

    renderResult(data.structured, data.demo_mode);
  } catch (error) {
    setStatus(`Analysis failed: ${error.message}`, "error");
  }
});

renderFileList();
