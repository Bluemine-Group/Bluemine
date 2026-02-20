chrome.runtime.onInstalled.addListener(() => {
  console.log("[Bluemine] Extension installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "BLUEMINE_PING") {
    sendResponse({ ok: true, source: "background" });
  }
});
