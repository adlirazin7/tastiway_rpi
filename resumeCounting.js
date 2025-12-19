import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import serviceAccount from "./service_account-cp4.json" with { type: "json" };
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";


// retrieve the custom machine Id 
const machineId = fs.readFileSync('/etc/machine_id_custom', 'utf8').trim();
// retrieve the variable from the node red
const combined = process.argv[2];
console.log("combined:", combined);
const decode = (v) => v.replace(/__SPACE__/g, " ");
const [orderId, activePicRaw, batchIdRaw, productNameRaw, expectedQuantity] = combined.split(",-,");
const activePic = decode(activePicRaw);
const batchId = decode(batchIdRaw);
const productName = decode(productNameRaw);
const nowMillis = Date.now();

if (!orderId) {
    console.error("❌ Missing orderId argument!");
    process.exit(1);
}



let db;
let dbFirestore;

try {
    // firebase init
    try {
        initializeApp({ credential: cert(serviceAccount) });
        dbFirestore = getFirestore();
    } catch (err) {
        throw new Error(`❌ Firestore initialization failed: ${err.message}`);
    }

    // Firestore -- update status
    try {
        await dbFirestore
            .collection("tastiway_plans")
            .doc(orderId)
            .update(
                {
                    status: "in_progress",
                    updatedAt: new Date(),
                },
            );
    } catch (err) {
        console.error(`❌ Firestore update status in plans failed: ${err.message}`);
    }

    // Firestore -- update ANDON signal system
    try {
        await dbFirestore
            .collection("tastiway_machines")
            .doc(machineId)
            .set(
                {
                    status: "green",
                    lastSeen: new Date(),
                },
                { merge: true }
            );
    } catch (err) {
        throw new Error(`❌ Firestore update Andon status failed: ${err.message}`);
    }

    console.log("Finished")

} catch (err) {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
} finally {
    if (db) {
        try {
            await db.close();
        } catch (err) {
            console.error("⚠️ Failed to close SQLite DB:", err.message);
        }
    }
}
