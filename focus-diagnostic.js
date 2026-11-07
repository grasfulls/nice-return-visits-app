// Temporary opt-in diagnostic for the iPad autofill scrolling issue.
(() => {
  if (new URLSearchParams(location.search).get("focus-debug") !== "1") return;
  const form = document.getElementById("me-form");
  const main = document.querySelector("main");
  const allowedFields = new Set([
    "me-name", "me-street", "me-city", "me-state", "me-postal-code",
    "me-region", "me-area", "me-lat", "me-lng",
  ]);
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Start focus diagnostic";
  Object.assign(button.style, {
    position: "fixed", right: "8px", top: "8px", zIndex: "10000",
    padding: "8px", background: "#fff", color: "#000", border: "2px solid #004080",
  });
  const panel = document.createElement("div");
  panel.hidden = true;
  Object.assign(panel.style, {
    position: "fixed", inset: "10% 5%", zIndex: "10001", background: "#fff",
    color: "#000", padding: "16px", border: "2px solid #004080", overflow: "auto",
  });
  const explanation = document.createElement("p");
  explanation.textContent = "Diagnostic measurements only; no field values. Select and copy the text below.";
  const output = document.createElement("textarea");
  output.readOnly = true;
  output.setAttribute("aria-label", "Focus diagnostic results");
  Object.assign(output.style, { width: "100%", height: "65%", boxSizing: "border-box" });
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => { panel.hidden = true; });
  panel.append(explanation, output, close);
  document.body.append(button, panel);

  let recording = false;
  let startTime = 0;
  let entries = [];
  const number = (value) => Math.round(value * 10) / 10;
  const record = (event, field = "") => {
    if (!recording) return;
    const active = document.activeElement;
    const activeId = allowedFields.has(active.id) ? active.id : "";
    const rect = activeId ? active.getBoundingClientRect() : null;
    const viewport = window.visualViewport;
    const item = {
      ms: Math.round(performance.now() - startTime), event, field, active: activeId,
      main: number(main.scrollTop), page: number(window.scrollY),
      viewportTop: viewport ? number(viewport.offsetTop) : null,
      viewportHeight: viewport ? number(viewport.height) : null,
      inputTop: rect ? number(rect.top) : null,
      inputBottom: rect ? number(rect.bottom) : null,
    };
    entries.push(item);
    if (entries.length > 200) entries.shift();
  };
  button.addEventListener("click", () => {
    if (!recording) {
      entries = [];
      startTime = performance.now();
      recording = true;
      button.textContent = "Show focus diagnostic";
      record("start");
    } else {
      record("show");
      recording = false;
      output.value = JSON.stringify(entries, null, 2);
      panel.hidden = false;
      button.textContent = "Start focus diagnostic";
      output.focus({ preventScroll: true });
      output.select();
    }
  });
  ["focusin", "focusout", "input", "change"].forEach((type) => {
    form.addEventListener(type, (event) => {
      if (allowedFields.has(event.target.id)) record(type, event.target.id);
    });
  });
  main.addEventListener("scroll", () => record("main-scroll"), { passive: true });
  window.addEventListener("scroll", () => record("page-scroll"), { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("scroll", () => record("viewport-scroll"), { passive: true });
    window.visualViewport.addEventListener("resize", () => record("viewport-resize"), { passive: true });
  }
})();
