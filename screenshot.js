import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import serviceAccount from "./service_account-cp4.json" with { type: "json" };

import fs from "fs";
import { exec } from "child_process";

const machineId = fs.readFileSync('/etc/machine_id_custom', 'utf8').trim();
const SCREENSHOT_PATH = "/home/pi/Pictures/screenshot.png"
let doc_ref

try {
    //firebase init 
    try {
        initializeApp({ credential: cert(serviceAccount) });
        const dbFirestore = getFirestore();
        doc_ref = dbFirestore.collection("tastiway_machines").doc(machineId)
    } catch (err) {
        throw new Error(`❌ Firestore initialisation failed ${err.message}`)
    }

    //Take screenshot 
    function takeScreenshot() {
        const cmd = `DISPLAY=:0 XAUTHORITY=/var/run/lightdm/root/:0 scrot -o ${SCREENSHOT_PATH}`;
        return new Promise((resolve, reject) => {
            exec(cmd, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    // Base64
    function imageToBase64() {
        const buffer = fs.readFileSync(SCREENSHOT_PATH);
        return buffer.toString("base64");
    }

    //* Listener
    console.log("Listening for screenshot request..");

    doc_ref.onSnapshot(async (snap) => {
        if (!snap.exists) return;

        const data = snap.data();

        if (data.requestSS === true) {
            console.log("📷 SS requested");
            try {
                const now = Date.now();

                await takeScreenshot();
                const base64SS = imageToBase64();

                await doc_ref.update({
                    screenshot: base64SS,
                    requestSS: false,
                    lastScreenshotTime: Timestamp.fromMillis(now),
                })
                console.log("ScreenShot updated");
            } catch (err) {
                console.log(`❌ Screenshot update failed: ${err.message}`)
            }
        }
    })
} catch (err) {
    console.log("❌ Error:", err.message);
    console.log(err.stack);
}

