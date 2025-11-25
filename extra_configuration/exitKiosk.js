import { exec } from "child_process";

console.log("🔴 Exiting kiosk mode...");

// Kill all Chromium browser instances
exec("pkill -f chromium", (error, stdout, stderr) => {
  if (error) {
    console.error("⚠️ Failed to exit kiosk mode:", error.message);
    return;
  }
  if (stderr) console.error(stderr);
  console.log("✅ Chromium kiosk mode exited successfully.");
});
