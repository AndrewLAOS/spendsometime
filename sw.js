self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  setInterval(() => {
    self.registration.showNotification("Spend Some Time", {
      body: "Stop scrolling. Go practice something useful.",
      icon: "/icon.png",
      badge: "/icon.png"
    });
  }, 1000 * 60 * 60 * 24); // once per day
});
