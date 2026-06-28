/* ─────────────────────────────────────────────────
   ConvertOFX · app.js
   Handles: upload, progress polling, messages,
            downloads, spinner states, file feedback.
   ───────────────────────────────────────────────── */

// ── DOM refs ────────────────────────────────────────
const form            = document.getElementById("convertForm");
const fileInput       = document.getElementById("file");
const uploadZone      = document.getElementById("uploadZone");
const uploadFilename  = document.getElementById("uploadFilename");
const submitButton    = document.getElementById("submitButton");

const messageBox      = document.getElementById("messageBox");
const progressWrapper = document.getElementById("progressWrapper");
const progressFill    = document.getElementById("progressFill");
const progressStep    = document.getElementById("progressStep");
const progressPercent = document.getElementById("progressPercent");
const progressSuccess = document.getElementById("progressSuccess");
const progressBar     = progressWrapper.querySelector(".progress-bar");
const downloadArea    = document.getElementById("downloadArea");
const downloadPdf     = document.getElementById("downloadPdf");
const downloadExcel   = document.getElementById("downloadExcel");

let currentPoll = null;

// ── File input feedback ──────────────────────────────
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) {
    uploadZone.classList.add("has-file");
    uploadFilename.textContent = file.name;
  } else {
    uploadZone.classList.remove("has-file");
    uploadFilename.textContent = "";
  }
});

// ── Drag-and-drop visual feedback ───────────────────
["dragenter", "dragover"].forEach((evt) => {
  uploadZone.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadZone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((evt) => {
  uploadZone.addEventListener(evt, () => {
    uploadZone.classList.remove("drag-over");
  });
});

// ── Helpers ──────────────────────────────────────────
function setMessage(message, tone = "info") {
  messageBox.textContent = message;
  messageBox.className   = `message-box ${tone}`;
  messageBox.classList.remove("hidden");
}

function clearMessage() {
  messageBox.textContent = "";
  messageBox.className   = "message-box hidden";
}

function resetDownloads() {
  downloadArea.classList.add("hidden");
  [downloadPdf, downloadExcel].forEach((link) => {
    link.classList.add("hidden");
    link.removeAttribute("href");
  });
}

function showProgress(step, percent) {
  progressWrapper.classList.remove("hidden");
  progressStep.textContent    = step;
  progressPercent.textContent = `${percent}%`;
  progressFill.style.width    = `${percent}%`;
  progressBar.setAttribute("aria-valuenow", percent);
}

function resetSuccessAnimation() {
  progressWrapper.classList.remove("is-success");
  progressStep.classList.remove("hidden");
  progressPercent.classList.remove("hidden");
  progressSuccess.classList.add("hidden");
  progressWrapper.querySelectorAll(".success-confetti").forEach((item) => item.remove());
}

function triggerSuccessAnimation() {
  resetSuccessAnimation();
  progressStep.classList.add("hidden");
  progressPercent.classList.add("hidden");
  progressSuccess.classList.remove("hidden");
  progressWrapper.classList.add("is-success");

  const confetti = [
    ["#00c8f2", -142, -30, -32, 0],
    ["#009ec3", -98, -52, 24, 35],
    ["#ffffff", -48, -42, 58, 80],
    ["#00c8f2", 28, -54, -18, 20],
    ["#059669", 78, -34, 42, 65],
    ["#a5f3fc", 126, -24, -54, 105],
    ["#00c8f2", -72, 18, 16, 120],
    ["#009ec3", 96, 16, -38, 140],
  ];

  confetti.forEach(([color, x, y, rotate, delay]) => {
    const particle = document.createElement("span");
    particle.className = "success-confetti";
    particle.style.setProperty("--confetti-color", color);
    particle.style.setProperty("--confetti-x", `${x}px`);
    particle.style.setProperty("--confetti-y", `${y}px`);
    particle.style.setProperty("--confetti-rotate", `${rotate}deg`);
    particle.style.setProperty("--confetti-delay", `${delay}ms`);
    progressWrapper.appendChild(particle);
  });

  window.setTimeout(() => {
    progressWrapper.querySelectorAll(".success-confetti").forEach((item) => item.remove());
  }, 1300);
}

function stopPolling() {
  if (currentPoll !== null) {
    window.clearTimeout(currentPoll);
    currentPoll = null;
  }
}

// ── Button spinner helpers ───────────────────────────
function setButtonLoading(btn, loading, defaultText) {
  const textEl    = btn.querySelector(".btn-text");
  const spinnerEl = btn.querySelector(".btn-spinner");

  btn.disabled = loading;

  if (loading) {
    btn.classList.add("is-loading");
    if (textEl) textEl.textContent = "Processando...";
  } else {
    btn.classList.remove("is-loading");
    if (textEl) textEl.textContent = defaultText;
  }
}

// ── Progress polling ─────────────────────────────────
async function pollProgress(jobId) {
  try {
    const response = await fetch(`/progress/${jobId}`);
    const data     = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Erro ao consultar progresso.");
    }

    showProgress(data.step || "Processando", data.progress || 0);

    if (data.status === "done") {
      setButtonLoading(submitButton, false, "Converter e Enviar");
      progressWrapper.classList.remove("is-error");
      progressWrapper.classList.toggle("is-warning", Boolean(data.warning));
      if (data.warning) {
        resetSuccessAnimation();
      } else {
        triggerSuccessAnimation();
      }
      setMessage(data.message, data.warning ? "warning" : "success");
      revealDownloads(data.downloads || {});
      stopPolling();
      return;
    }

    if (data.status === "error") {
      setButtonLoading(submitButton, false, "Converter e Enviar");
      resetSuccessAnimation();
      progressWrapper.classList.add("is-error");
      setMessage(data.message || "Erro no processamento.", "error");
      stopPolling();
      return;
    }

    currentPoll = window.setTimeout(() => pollProgress(jobId), 1000);
  } catch (error) {
    setButtonLoading(submitButton, false, "Converter e Enviar");
    progressWrapper.classList.add("is-error");
    setMessage(error.message || "Erro ao acompanhar o progresso.", "error");
    stopPolling();
  }
}

// ── Reveal downloads ─────────────────────────────────
function revealDownloads(downloads) {
  resetDownloads();
  let hasDownloads = false;

  if (downloads.pdf) {
    downloadPdf.href = downloads.pdf;
    downloadPdf.classList.remove("hidden");
    hasDownloads = true;
  }

  if (downloads.excel) {
    downloadExcel.href = downloads.excel;
    downloadExcel.classList.remove("hidden");
    hasDownloads = true;
  }

  if (hasDownloads) {
    downloadArea.classList.remove("hidden");
  }
}



// ── Form submit ──────────────────────────────────────
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  stopPolling();
  clearMessage();
  resetDownloads();

  const file = fileInput.files[0];
  if (!file) {
    setMessage("Selecione um arquivo OFX antes de continuar.", "error");
    return;
  }

  setButtonLoading(submitButton, true, "Converter e Enviar");
  resetSuccessAnimation();
  progressWrapper.classList.remove("hidden", "is-error", "is-warning");
  showProgress("Enviando arquivo", 5);

  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/convert", {
      method: "POST",
      body:   formData,
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Erro ao iniciar a conversão.");
    }

    setMessage(data.message || "Conversão iniciada.", "info");
    currentPoll = window.setTimeout(() => pollProgress(data.job_id), 400);
  } catch (error) {
    setButtonLoading(submitButton, false, "Converter e Enviar");
    resetSuccessAnimation();
    progressWrapper.classList.add("is-error");
    setMessage(error.message || "Erro ao enviar o arquivo.", "error");
  }
});

