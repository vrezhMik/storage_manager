// Bridge between the Flexit terminal page and the extension: the page posts
// {type: "FLEXIT_SRC_REQUEST", id, path, payload}; the answer comes back as
// {type: "FLEXIT_SRC_RESPONSE", id, status, body | error}.
document.documentElement.dataset.flexitSrc = "1";

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.type !== "FLEXIT_SRC_REQUEST") return;
  const { id, path, payload } = event.data;
  chrome.runtime.sendMessage({ path, payload }, (answer) => {
    const error = chrome.runtime.lastError?.message;
    window.postMessage({ type: "FLEXIT_SRC_RESPONSE", id, ...(error ? { error } : answer) }, window.location.origin);
  });
});
