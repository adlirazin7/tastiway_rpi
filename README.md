# Tastiway RPI — Operations Handover (Factory Floor Staff)

> **System name:** Tastiway Production Counter
> **Audience:** Supervisors and operators on the factory floor
> **Last updated:** 2026-09-03

This guide explains how to use the Tastiway touchscreen at each machine station for daily
production counting.

---

## 1. What the system does

The Tastiway touchscreen at each machine station:

- Shows today's **production orders** (what needs to be produced)
- **Counts production output** automatically using a sensor
- Tracks the **traffic light status** (Running / Need Help / Breakdown)
- Sends all data to the cloud so supervisors can monitor from the office

---

## 2. Starting a production run

### Step 1: Enter your name

On the **Production Plan** screen, type your name in the **PIC** (Person In Charge) field at the top.

### Step 2: Select the order

Tap the **order card** for the production order you want to start. Each card shows:
- Product name
- Batch ID
- Order ID
- Target quantity
- Planned start date

If you need to refresh the order list, tap the **Refresh** button.

### Step 3: Production starts

After tapping the order card, the screen switches to the **Process** page showing:
- A **count gauge** (circular display showing current count vs target)
- An **elapsed timer** (how long the run has been going)
- Three **traffic light buttons** (Running / Assistance / Breakdown)
- A **Finish** button

The count updates automatically as the machine produces.

---

## 3. During production

### Traffic light buttons

Use these buttons to report the machine status:

| Button | Colour | Meaning | Timer |
|--------|--------|---------|-------|
| **Running** | Green | Machine is running normally | Timer runs |
| **Assistance** | Blue | Need help (e.g. material request) | Timer pauses |
| **Breakdown** | Red | Machine is broken down | Timer pauses |

Always press the correct button when the status changes. This data is used for reporting.

### The count gauge

The circular gauge shows:
- **Current count** (how many units produced so far)
- **Target quantity** (from the production order)

For most machines, the count goes up by 1 each time the sensor detects a product. For TMM machines,
the count is in kg and updates every few seconds based on energy consumption.

---

## 4. Finishing a production run

1. Press the **Finish** button when the order is complete.
2. For most machines, a dialog will ask for the **reject quantity** (how many defective units). Enter
   the number and confirm.
3. For some machines (TMM, BPM, ZTP), the finish happens automatically without asking for rejects.
4. The screen returns to the **Production Plan** page, ready for the next order.

---

## 5. Resuming after a restart

If the power goes off or the system restarts while an order is in progress:

1. The system will automatically detect the unfinished order.
2. A **yellow Resume card** will appear at the top of the Production Plan page.
3. Tap the Resume card to continue where you left off.
4. The count will be preserved — no data is lost.

---

## 6. Manual batch entry

If the production order is not in the system:

1. Look for the **Manual Batch** section on the Production Plan page.
2. Enter the **Batch ID** and **Quantity**.
3. Tap to start the manual batch.

---

## 7. If the internet is down

**Keep working normally.** The system saves everything locally on the device. When the internet
comes back, all data will sync to the cloud automatically. You may see the WiFi indicator (top of
the screen) turn red — this is expected and does not affect counting.

---

## 8. Common questions

| Question | Answer |
|----------|--------|
| *The count is not going up* | Check if the sensor is working (proximity sensor near the machine output). For TMM machines, check if the machine is actually consuming power above the threshold. |
| *I selected the wrong order* | Press Finish with 0 rejects to close it, then start the correct order. |
| *The screen is frozen* | Wait 30 seconds. If still frozen, ask maintenance to restart the device. |
| *Orders are not showing* | Tap the Refresh button. If still empty, the internet may be down — orders will appear when connectivity returns. Check with the office if the orders have been created in the system. |
| *The traffic light is wrong colour* | Press the correct traffic light button on the screen. |
| *How do I exit the full-screen app?* | Press the **Close App** button (X icon) in the top bar. This is for maintenance only. |

---

## 9. For supervisors — remote monitoring

From the office, you can:

- **View live machine status** in the Firestore `tastiway_machines` collection or via the monitoring
  dashboard. Each machine shows its current andon colour, count, product, and last-seen time.
- **Request a screenshot** of any machine's screen by setting `requestSS = true` on the machine's
  Firestore document. The screenshot will appear in the `screenshot` field within a few seconds.
- **View production reports** in the `tastiway_reports` collection, which contains the full history
  of each order: start/stop times, counts, rejects, and the 5-minute log data.

---

## 10. Maintenance notes (for supervisors)

- The system **automatically syncs** data to the cloud every 5 minutes.
- The system **automatically refreshes** the order list every 4 hours.
- If a device needs to be restarted, simply **turn it off and on**. It will start up automatically
  in kiosk mode and check for any unfinished orders.
- If the Node-RED editor needs to be accessed (for debugging), navigate to `http://<device-ip>:6018/`
  from a laptop on the same network. Login: `pi` / (ask IT for password).

---

*End of operations handover document.*
