import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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
const [orderIdRaw, activePicRaw, batchIdRaw] = combined.split(",-,");
const orderId = decode(orderIdRaw);
const activePic = decode(activePicRaw);
const batchId = decode(batchIdRaw);

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

    // Sqlite -- tastiway-process table
    const nowMillis = Date.now();
    try {// orderId Primary key
        await db.run(
            `INSERT OR IGNORE INTO tastiway_process (orderId, start, pic, batchId)
             VALUES (?, ?, ?, ?)`,
            [orderId, nowMillis, activePic, batchId]
        );
    } catch (err) {
        throw new Error(`❌ SQLite table 'process' failed: ${err.message}`);
    }

    //Sqlite -- current table
    try {
        const currentRow = await db.all(`SELECT * FROM current LIMIT 1;`);

        if (currentRow.length === 0) {
            // table empty -> insert new
            await db.run(
                `INSERT INTO current (orderId, counts, pic) VALUES (?, ?, ?)`,
                [orderId, 0, activePic]
            );
        } else if (currentRow.orderId !== orderId) {
            // different order -> clear and insert new
            await db.run(`DELETE FROM current;`);
            await db.run(
                `INSERT INTO current (orderId, counts, pic) VALUES (?, ?, ?)`,
                [orderId, 0, activePic]
            );
        } else {
            // same orderId -> keep as is
        }
    } catch (err) {
        throw new Error(`❌ 'current' table handling failed: ${err.message}`);
    }


    // Firestore -- update status
    try {
        await dbFirestore
            .collection("tastiway_plans")
            .doc(orderId)
            .set(
                {
                    status: "in_progress",
                    updatedAt: new Date(),
                },
                { merge: true }
            );
    } catch (err) {
        throw new Error(`❌ Firestore update status in plans failed: ${err.message}`);
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

    // Firestore -- create doc for report
    try {
        const order = await db.all(`SELECT * FROM tastiway_process WHERE orderId = ?`, [orderId]);
        if (order.length === 0) {
            throw new Error(`${orderId} is not found in the tastiway_process`)
        }
        // set the doc in the firestore
        await dbFirestore
            .collection("tastiway_reports")
            .doc(orderId)
            .set(
                {
                    orderId: orderId,
                    start: Timestamp.fromMillis(order["start"]),
                    batchId: order["batchId"],
                    machineId: machineId,
                    pic: order["pic"]
                },
            )
        // once added into 'report', modify the updated
        await db.run(
            `UPDATE tastiway_process
                SET uploadedStart = 1
                WHERE orderId = ?`,
            [orderId]
        );
    } catch (err) {
        throw new Error(`❌ Report creation failed for orderId=${orderId}: ${err.message}`);

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
