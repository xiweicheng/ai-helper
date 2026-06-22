const crxClientPortName = `@crx/client:${"j_MpoBvlsDvU"}`;
function hasOwnExtensionRuntime(runtime2, extensionId2) {
  try {
    return new URL(runtime2.getURL("")).host === extensionId2;
  } catch {
    return false;
  }
}
const runtime = typeof chrome === "undefined" ? void 0 : chrome.runtime;
const extensionId = new URL(import.meta.url).host;
const connectsToOwnRuntime = runtime ? hasOwnExtensionRuntime(runtime, extensionId) : false;
function isCrxHMRPayload(x) {
  return x.type === "custom" && x.event.startsWith("crx:");
}
class HMRPort {
  port;
  callbacks = /* @__PURE__ */ new Map();
  constructor() {
    setInterval(() => {
      try {
        this.port?.postMessage({ data: "ping" });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Extension context invalidated.")) {
          location.reload();
        } else
          throw error;
      }
    }, 5000);
    setInterval(this.initPort, 5 * 60 * 1e3);
    this.initPort();
  }
  initPort = () => {
    if (!runtime)
      throw new Error("[crx] chrome.runtime is not available");
    const connectInfo = { name: crxClientPortName };
    this.port?.disconnect();
    this.port = connectsToOwnRuntime ? runtime.connect(connectInfo) : runtime.connect(extensionId, connectInfo);
    this.port.onDisconnect.addListener(this.handleDisconnect.bind(this));
    this.port.onMessage.addListener(this.handleMessage.bind(this));
    this.port.postMessage({ type: "connected" });
  };
  handleDisconnect = () => {
    if (this.callbacks.has("close"))
      for (const cb of this.callbacks.get("close")) {
        cb({ wasClean: true });
      }
  };
  handleMessage = (message) => {
    const forward = (data) => {
      if (this.callbacks.has("message"))
        for (const cb of this.callbacks.get("message")) {
          cb({ data });
        }
    };
    const payload = JSON.parse(message.data);
    if (isCrxHMRPayload(payload)) {
      if (payload.event === "crx:runtime-reload") {
        if (true) {
          console.log("[crx] runtime reload");
          setTimeout(() => location.reload(), 500);
        } else {
          console.log("[crx] runtime reload suppressed (liveReload disabled)");
        }
      } else {
        forward(JSON.stringify(payload.data));
      }
    } else {
      forward(message.data);
    }
  };
  addEventListener = (event, callback) => {
    const cbs = this.callbacks.get(event) ?? /* @__PURE__ */ new Set();
    cbs.add(callback);
    this.callbacks.set(event, cbs);
  };
  send = (data) => {
    if (this.port)
      this.port.postMessage({ data });
    else
      throw new Error("HMRPort is not initialized");
  };
}

export { HMRPort };
