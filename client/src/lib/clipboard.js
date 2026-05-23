function createHiddenCopyTarget(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.setAttribute("aria-hidden", "true");
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "-9999px";
  textArea.style.opacity = "0";

  return textArea;
}

export async function copyTextToClipboard(text) {
  const value = String(text || "");

  if (!value) {
    return false;
  }

  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall back to the legacy copy path below for HTTP/dev environments.
    }
  }

  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    throw new Error("Clipboard copy is not available in this browser");
  }

  const textArea = createHiddenCopyTarget(value);
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, textArea.value.length);

  try {
    const wasCopied = document.execCommand("copy");
    if (!wasCopied) {
      throw new Error("Clipboard copy was blocked by the browser");
    }

    return true;
  } finally {
    document.body.removeChild(textArea);
  }
}
