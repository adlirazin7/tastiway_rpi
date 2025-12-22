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
let msg;

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
        msg += "✅ finished update status machine in the tastiway_plans";
    } catch (err) {
        console.error(`❌ Firestore update status in plans failed: ${err.message}`);
    }

    // Sqlite -- retrieve  table current
    try {
        currentRows = await db.all(`SELECT * FROM current LIMIT 1;`);
        if (currentRows.length > 0) {
            currentRow = currentRows[0]
        }
    } catch (err) {
        throw new Error(`❌ Retrieve 'current' table failed: ${err.message}`);
    }


    // Firestore -- update ANDON signal system
    try {
        const plan = await db.all(`SELECT * FROM tastiway_plan WHERE orderId=?`, currentRow["orderId"])
        let expectedQuantity;
        let productName;

        if (plan.length === 0) {
            expectedQuantity = 0;
            productName = ""
        } else {
            expectedQuantity = plan[0]["quantity"]
            productName = plan[0]["productName"]
        }
        await dbFirestore
            .collection("tastiway_machines")
            .doc(machineId)
            .set(
                {
                    status: currentRow["andon"],
                    lastSeen: new Date(),
                    count: currentRow["counts"],
                    expectedQuantity: expectedQuantity,
                    productName: productName,
                },
                { merge: true }
            );
        msg += "✅ finished upload the status to tastiway_machines";
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
