# Tastiway RPI — Installation & Setup Guide

> **System name:** Tastiway Production Counter
> **Target device:** Raspberry Pi (Raspberry Pi OS, user `pi`)
> **Last updated:** 2026-09-09

This guide walks through installing the Tastiway Production Counter on a fresh Raspberry Pi
from scratch: installing Node.js and Node-RED, cloning this repository, choosing the correct
Node-RED flow for the machine, setting the machine ID, and enabling kiosk mode so everything
auto-starts when the device powers on.

---

## 0. Overview

Each Raspberry Pi is dedicated to **one machine** on the factory floor. It runs:

- **Node-RED** — the flow engine + touchscreen dashboard (editor/dashboard on port **6018**).
- A set of **Node.js scripts** (in `/home/pi/Project/`) that Node-RED calls to fetch orders,
  count production, sync to Firestore, take screenshots, etc.
- **Chromium in kiosk mode**, which opens the dashboard full-screen on boot.

There are **two Node-RED flow variants** in this repo — you install exactly one, depending on
how the machine counts production:

| Folder | Use for | Counting method |
|--------|---------|-----------------|
| `.node-red_project_count` | Most machines (ZPL, BPM, ZTP, etc.) | GPIO proximity sensor (count +1 per product) |
| `.node-red_project_modbus` | TMM and other metered machines | Modbus energy meter (kg based on power) |

> Only **one** of these is copied into `~/.node-red`. Pick based on the machine type.

---

## 1. Prepare the Raspberry Pi

1. Flash **Raspberry Pi OS (with desktop)** and boot the device.
2. Set the username to **`pi`** (all paths in this project assume `/home/pi`).
3. Connect to Wi-Fi / network and update the system:

   ```bash
   sudo apt update && sudo apt full-upgrade -y
   ```

---

## 2. Install Node.js and Node-RED

Use the official Node-RED install script — it installs a compatible Node.js, Node-RED, and sets
up the **systemd service** used for auto-start:

```bash
bash <(curl -sL https://raw.githubusercontent.com/node-red/linux-installers/master/deb/update-nodejs-and-nodered)
```

Accept the prompts (Pi-specific settings: **yes**). When it finishes, verify:

```bash
node -v          # should print a Node.js version
node-red --version   # should print Node-RED 4.1.0 or compatible
```

Do **not** start Node-RED yet — we install the flow first (Section 5).

---

## 3. Clone this repository

Clone the repo to **`/home/pi/Project`** (the scripts are hard-coded to this path — e.g.
`node /home/pi/Project/startCounting.js`).

```bash
cd /home/pi
git clone <REPO_URL> Project
cd Project
```

Install the Node.js script dependencies (firebase-admin, sqlite):

```bash
npm install
```

---

## 4. Add the required secret files

These are **not** in git and must be added manually.

### 4a. Firebase service account

Copy the Firebase service account key into the Project folder as
**`/home/pi/Project/service_account-cp4.json`**. All scripts import it directly:

```bash
# copy your key file into place
cp /path/to/service_account-cp4.json /home/pi/Project/service_account-cp4.json
```

> ⚠️ Never commit this file — it is listed in `.gitignore`.

### 4b. Machine ID file (`/etc/machine_id_custom`)

Every script reads the machine identity from **`/etc/machine_id_custom`**. This single line
tells the system which machine this Pi belongs to (e.g. `TMM001`, `ZPL001`, `ZPL002`, `RHT001`).

A template is provided at `extra_configuration/machine_id_custom`. Create the file with the
**correct ID for this machine**:

```bash
# replace ZPL001 with this machine's actual ID
echo "ZPL001" | sudo tee /etc/machine_id_custom
```

Verify:

```bash
cat /etc/machine_id_custom
```

> The ID must match the `machineId` used in the cloud (Firestore `tastiway_machines` /
> `tastiway_reports`), otherwise orders and counts will not match up.

### 4c. Machine config file (`/home/pi/config.json`) — Modbus / TMM machines only

Metered machines calculate output from power consumption. `countTMM.js` reads its parameters
from **`/home/pi/config.json`** (note: the home folder, **not** the Project folder). A template
is provided at the repo root (`config.json`):

```json
{"threshold":2,"kgperhour":42}
```

- `threshold` — kW cut-off; the machine is counted as "running" only when power is above this.
- `kgperhour` — production rate used to convert running time into kilograms.

Copy it into place and adjust the values for this machine:

```bash
cp /home/pi/Project/config.json /home/pi/config.json
# then edit /home/pi/config.json with the correct threshold / kgperhour
```

> Standard proximity-sensor machines do not use this file and can skip this step.

---

## 5. Install the correct Node-RED flow

Node-RED runs from **`/home/pi/.node-red`**. Copy the contents of the flow variant that matches
this machine into that folder so it loads automatically on start.

**For a standard proximity-sensor machine:**

```bash
cp -r /home/pi/Project/.node-red_project_count/. /home/pi/.node-red/
```

**For a Modbus / metered machine (e.g. TMM):**

```bash
cp -r /home/pi/Project/.node-red_project_modbus/. /home/pi/.node-red/
```

Then install the Node-RED node dependencies (dashboard, modbus, sqlite, firestore, etc.):

```bash
cd /home/pi/.node-red
npm install
```

> The flow's `settings.js` sets the editor/dashboard port to **6018** and the credential secret.
> Keep both files as copied.

---

## 6. Enable Node-RED auto-start on boot

The official installer registers a **systemd service**. Enable it so Node-RED starts on every
boot:

```bash
sudo systemctl enable nodered.service
sudo systemctl start nodered.service
```

Check it is running, then open the dashboard from another PC on the network to confirm:

```bash
sudo systemctl status nodered.service
# dashboard:  http://<device-ip>:6018/dashboard/production_plan
# editor:     http://<device-ip>:6018/
```

Useful commands: `node-red-start`, `node-red-stop`, `node-red-log`.

---

## 7. Set up kiosk mode (auto-open the dashboard)

On boot the Pi should open the dashboard full-screen in Chromium. This is driven by
`onBoot.sh` + a desktop autostart entry.

1. Copy the boot script and exit helper into `/home/pi/Documents/`:

   ```bash
   mkdir -p /home/pi/Documents
   cp /home/pi/Project/onBoot.sh /home/pi/Documents/onBoot.sh
   cp /home/pi/Project/extra_configuration/exitKiosk.js /home/pi/Documents/exitKiosk.js
   chmod +x /home/pi/Documents/onBoot.sh
   ```

   `onBoot.sh` waits for the network, then launches Chromium in kiosk mode pointing at
   `http://localhost:6018/dashboard/production_plan`.

2. (Optional) Place the app icon used by the launcher:

   ```bash
   cp /path/to/circle_tastiway.png /home/pi/Pictures/circle_tastiway.png
   ```

3. Install the autostart entry so kiosk mode launches on desktop login:

   ```bash
   mkdir -p /home/pi/.config/autostart
   cp /home/pi/Project/Kiosk.desktop /home/pi/.config/autostart/Kiosk.desktop
   ```

   `Kiosk.desktop` runs `/home/pi/Documents/onBoot.sh`.

---

## 8. Enable the on-screen (touchscreen) keyboard

So operators can type (PIC name, manual batch, reject quantity) on the touchscreen without a
physical keyboard, enable an on-screen keyboard. This follows the
[UbuntuHandbook on-screen keyboard guide](https://ubuntuhandbook.org/index.php/2022/05/enable-on-screen-keyboard-ubuntu-22-04/).

### Method 1 — Built-in Screen Keyboard (quick)

Open **Settings → Accessibility**, scroll to **Typing**, and turn on **Screen Keyboard**.

> The built-in keyboard only pops up in limited fields, so for reliable kiosk typing use
> Method 2.

### Method 2 — Improved OSK extension (recommended)

Install the GNOME Extension Manager, then add the **Improved OSK** extension:

```bash
sudo apt install gnome-shell-extension-manager
```

1. Open **Extension Manager** (press the Super key and search for it).
2. Under the **Browse** tab, search for **Improved OSK** and install it.
3. In its settings, adjust the keyboard size and enable the top-bar toggle button so the
   keyboard can be opened on demand.

Test by tapping a text field on the dashboard — the on-screen keyboard should appear.

---

## 9. First boot / verification

Reboot the device:

```bash
sudo reboot
```

After reboot, confirm:

- [ ] Node-RED service is running (`sudo systemctl status nodered.service`).
- [ ] Chromium opens full-screen showing the **Production Plan** page.
- [ ] The correct machine ID appears / orders for this machine load (Refresh if needed).
- [ ] Counting works (trigger the sensor / meter and watch the gauge).
- [ ] Data reaches the cloud (check the `tastiway_machines` Firestore document for this ID).

The local SQLite database is created automatically at `/home/pi/Project/tastiway.db`.

---

## 10. RHT sensor devices (temperature / humidity) — optional

Some devices instead run the standalone RHT reader (`rht.py` / `rht.js`), which reads its ID
from `rht_id.txt` (e.g. `RHT001`) in the Project folder rather than `/etc/machine_id_custom`.
If you are setting up an RHT sensor node, set its ID:

```bash
echo "RHT001" > /home/pi/Project/rht_id.txt
```

---

## 11. Path reference

| What | Location |
|------|----------|
| Repo / Node.js scripts | `/home/pi/Project/` |
| Firebase key | `/home/pi/Project/service_account-cp4.json` |
| Local database | `/home/pi/Project/tastiway.db` |
| Machine ID | `/etc/machine_id_custom` |
| Machine config (Modbus/TMM) | `/home/pi/config.json` |
| Active Node-RED flow | `/home/pi/.node-red/` |
| Kiosk boot script | `/home/pi/Documents/onBoot.sh` |
| Kiosk exit helper | `/home/pi/Documents/exitKiosk.js` |
| Autostart entry | `/home/pi/.config/autostart/Kiosk.desktop` |
| Dashboard | `http://<device-ip>:6018/dashboard/production_plan` |
| Node-RED editor | `http://<device-ip>:6018/` |

---

## 12. Updating an existing device

```bash
cd /home/pi/Project
git pull

# if the active flow changed, re-copy the matching variant, then:
cd /home/pi/.node-red && npm install
node-red-restart   # or: sudo systemctl restart nodered.service
```

---

*End of installation guide. For day-to-day operator instructions, refer to the operations
handover documentation.*
