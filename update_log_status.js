import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import serviceAccount from "./service_account-cp4.json" with { type: "json" };
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";

// retrieve the custom machine Id 
const machineId = fs.readFileSync('/etc/machine_id_custom', 'utf8').trim();
const nowMillis = Date.now();

let db;
let dbFirestore;
let currentRows;
let currentRow;
let msg = "update log & upload status\n";

try {
    // firebase init
    try {
        initializeApp({ credential: cert(serviceAccount) });
        dbFirestore = getFirestore();
    } catch (err) {
        throw new Error(`❌ Firestore initialization failed: ${err.message}`);
    }

    // Sqlite init
    const dbPath = "/home/pi/Project/tastiway.db";
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });
    } catch (err) {
        throw new Error(`❌  SQLite open failed: ${err.message}`);
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

    // Sqlite -- update the log table
    if (currentRows.length === 1) {
        try {
            let duration;
            // retrieve latest duration 
            const latestRow = await db.all(`SELECT duration from log WHERE orderId=? ORDER BY id DESC LIMIT 1`, [currentRow["orderId"]]);
            if (latestRow.length === 0) {
                duration = 0
            } else {
                duration = latestRow[0]["duration"] + 5 * 60 * 1000; // in millisecond
            }
            await db.run(
                `INSERT INTO log (orderId, count, andon, timestamp, duration) VALUES (?,?,?,?,?)`, [currentRow["orderId"], currentRow["counts"], currentRow["andon"], nowMillis, duration]
            );
            msg += "✅ finished update log table";

        } catch (err) {
            throw new Error(`❌ Update 'log' table failed: ${err.message}`);
        }
    }

    // Firestore -- update 'real-time' data to the machine
    if (currentRows.length === 0) {
        try {
            await dbFirestore
                .collection("tastiway_machines")
                .doc(machineId)
                .set(
                    {
                        status: "yellow",
                        lastSeen: new Date(),
                        count: null,
                        expectedQuantity: null,
                        productName: null,
                    },
                    { merge: true }
                );
            msg += "✅ finished upload the status to machine";
        } catch (err) {
            throw new Error(`❌ Firestore update Andon status failed: ${err.message}`);
        }
    } else {
        try {
            const plan = await db.all(`SELECT * FROM tastiway_plan WHERE orderId=?`, [orderId])
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
            msg += "✅ finished upload the status to machine";
        } catch (err) {
            throw new Error(`❌ Firestore update Andon status failed: ${err.message}`);
        }
    }


    console.log(msg)

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
