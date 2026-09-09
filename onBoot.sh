#!/bin/bash

# --- Configuration ---
#URL="http://localhost:6018/dashboard/production_plan"

# Path to Chrome executable (macOS/Linux examples below)
# macOS (Google Chrome.app)
#CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Linux example:
# CHROME_PATH="/usr/bin/google-chrome"
#!/bin/bash

# --- Configuration ---
URL="http://localhost:6018/dashboard/production_plan"

# Path to Chromium browser (default on Raspberry Pi OS)
CHROMIUM_PATH="/usr/bin/chromium-browser"

# --- Optional: wait for network before launching ---
sleep 5

# --- Kill any previous Chromium instances ---
pkill -f chromium-browser

# --- Run Chromium in kiosk mode ---
$CHROMIUM_PATH \
  --kiosk "$URL" \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --incognito \
  --start-fullscreen \
  --no-first-run \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --no-default-browser-check &

# --- Run Chrome in Kiosk Mode ---
"$CHROME_PATH" \
  --kiosk "$URL" \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --incognito \
  --start-fullscreen \
  --no-first-run \
  --disable-pinch \
  --overscroll-history-navigation=0
