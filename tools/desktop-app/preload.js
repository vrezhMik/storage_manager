// The only thing the terminal page gets from the app: device requests.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("flexitNative", {
  platform: "windows",
  // spec: { url, method, headers, body, timeoutMs } -> { status, headers, body }
  request: (spec) => ipcRenderer.invoke("flexit-native-request", spec),
});
