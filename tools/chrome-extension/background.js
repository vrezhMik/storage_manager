// Calls e-invoicing from this computer (its own IP) with the e-invoicing
// session opened on file-online.taxservice.am. Only e-invoicing API paths
// are allowed.
const API = "https://e-invoicing.taxservice.am/api/";

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const path = String(message?.path ?? "");
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/i.test(path)) {
    reply({ error: "Bad path" });
    return false;
  }
  fetch(API + path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ payload: message.payload ?? {} }),
  })
    .then(async (res) => reply({ status: res.status, body: await res.text() }))
    .catch((err) => reply({ error: String(err?.message ?? err) }));
  return true; // answer comes later
});
