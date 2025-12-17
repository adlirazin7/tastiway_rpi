import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import serviceAccount from "./service_account-cp4.json" with { type: "json" };
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";


// retrieve the custom machine Id 
const machineId = fs.readFileSync('/etc/machine_id_custom', 'utf8').trim();


let db;
let dbFirestore;
let orderId;

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

    // Sqlite -- check start process in tastiway_process table
    let orders = []
    try {
        orders = await db.all(
            `SELECT orderId, start, batchId, pic FROM tastiway_process WHERE uploadedStart = 0`,
        );
    } catch (err) {
        throw new Error(`❌ SQLite table 'process' failed: ${err.message}`);
    }

    // Firestore -- create doc for each  in the collection 'reports'
    try {
        for (const order of orders) {
            orderId = order["orderId"]
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
        }
    } catch (err) {
        throw new Error(`❌ Firestore Report creation failed for orderId=${orderId}: ${err.message}`);
    }

    //Firestore -- append data from log into the respective dos in the collection report
    try {
        for (const order of orders) {
            orderId = order["orderId"]
            // retrieve the andon array for that period from count_logs
            const data = await db.all(`SELECT timestamp, count, andon, duration FROM log WHERE orderId=? AND uploaded=0`, [orderId]);
            if (data.length === 0) {
                continue
            }
            // set the doc in the firestorewhy 
            await dbFirestore
                .collection("tastiway_reports")
                .doc(orderId)
                .set(
                    {
                        data: data,
                    },
                    { merge: true }
                )
            // once added into 'report', update the uploaded in the log table
            await db.run(
                `UPDATE log
                SET uploaded = 1
                WHERE orderId = ?`,
                [orderId]
            );
        }
    } catch (err) {
        throw new Error(`❌ Firestore add into record from log failed: ${err.message} for ${orderId}`);
    }


    // Sqlite -- check finish process in tastiway_process table
    let ordersFinish = []
    try {
        ordersFinish = await db.all(
            `SELECT orderId, stop, counts, reject FROM tastiway_process WHERE uploaded = 0`,
        );
    } catch (err) {
        throw new Error(`❌ SQLite table 'process retrieve finish' failed: ${err.message}`);
    }


    //Firestore -- update finish info into collection report
    try {
        for (const order of ordersFinish) {
            orderId = order["orderId"]
            // retrieve the andon array for that period from count_logs
            await dbFirestore
                .collection("tastiway_reports")
                .doc(orderId)
                .set(
                    {
                        stop: Timestamp.fromMillis(order["stop"]),
                        finalCount: order["counts"],
                        reject: order["reject"],
                    },
                    { merge: true }
                )
            // once added into 'report', modify the updated
            await db.run(
                `UPDATE tastiway_process
                SET uploaded = 1
                WHERE orderId = ?`,
                [orderId]
            );
        }
    } catch (err) {
        throw new Error(`❌ Firestore add into record failed: ${err.message} for ${orderId}`);
    }

    console.log(`✅ update report finished`)

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
