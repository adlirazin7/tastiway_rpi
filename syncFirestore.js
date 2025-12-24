import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import serviceAccount from "./service_account-cp4.json" with { type: "json" };
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";


// retrieve the custom machine Id 
const machineId = fs.readFileSync('/etc/machine_id_custom', 'utf8').trim();

const { arrayUnion } = FieldValue;
let db;
let dbFirestore;
let orderId;
let msg = "report sync started\n";

// set the uom
const machineUom = {
    TMM001: "kg",
    ZPL001: "PACK",
    ZTP001: "PACK",
    SMW001: "kg",
    BPM001: "PACK",

}

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
            `SELECT *  FROM tastiway_process WHERE uploadedStart = 0`,
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
                        pic: order["pic"],
                        productName: order["productName"],
                        expectedQuantity: order["expectedQuantity"],
                        expectedStart: new Date(order["expectedStart"]),
                        expectedEnd: new Date(order["expectedEnd"]),
                    },
                    { merge: true }
                )
            // once added into 'report', modify the updated
            await db.run(
                `UPDATE tastiway_process
                SET uploadedStart = 1
                WHERE orderId = ?`,
                [orderId]
            );
        }
        msg += `✅ finished upload the start of the process`;
    } catch (err) {
        throw new Error(`❌ Firestore Report creation failed for orderId=${orderId}: ${err.message}`);
    }


    //Firestore -- append data from log into the respective dos in the collection report
    try {
        //retrive the orderId (per doc) of where at least one row is not uploaded yet
        const logOrders = await db.all(`SELECT DISTINCT orderId FROM log WHERE uploaded = 0;`)
        for (const order of logOrders) {
            orderId = order["orderId"]
            try {
                // retrieve the andon array for that period from count_logs
                const data = await db.all(`SELECT timestamp, count, andon, duration FROM log WHERE orderId=? AND uploaded=0`, [orderId]);
                if (data.length === 0) { continue }
                // set the doc in the firestorewhy 
                await dbFirestore
                    .collection("tastiway_reports")
                    .doc(orderId)
                    .update({
                        data: arrayUnion(...data)
                    });
                // once added into 'report', update the uploaded in the log table
                await db.run(
                    `UPDATE log
                SET uploaded = 1
                WHERE orderId = ?`,
                    [orderId]
                );
            } catch (err) {
                console.error(`❌ Failed to upload orderId=${orderId}: ${err.message}`);
                continue;
            }
        }
        msg += `✅ finished upload the log table`;
    } catch (err) {
        throw new Error(`❌ Firestore add into record from log failed: ${err.message} for ${orderId}`);
    }


    // Sqlite -- check finish process in tastiway_process table
    let ordersFinish = []
    try {
        ordersFinish = await db.all(
            `SELECT orderId, stop, counts, reject, expectedQuantity FROM tastiway_process WHERE uploaded = 0`,
        );
    } catch (err) {
        throw new Error(`❌ SQLite table 'process retrieve finish' failed: ${err.message}`);
    }


    //Firestore -- update finish info into collection report
    try {
        for (const order of ordersFinish) {
            if (!order["stop"]) { continue }
            orderId = order["orderId"]
            try {
                await dbFirestore
                    .collection("tastiway_reports")
                    .doc(orderId)
                    .update(
                        {
                            stop: Timestamp.fromMillis(order["stop"]),
                            finalCount: order["counts"],
                            reject: order["counts"] - order["reject"],
                            uom: machineUom[machineId],
                        },
                    )
                // once added into 'report', modify the updated
                await db.run(
                    `UPDATE tastiway_process
                SET uploaded = 1
                WHERE orderId = ?`,
                    [orderId]
                );
            } catch (err) {
                console.error(`❌ Failed to upload orderId=${orderId}: ${err.message}`);
                continue;
            }
            try {
                await dbFirestore
                    .collection("tastiway_plans")
                    .doc(orderId)
                    .update(
                        {
                            status: "completed",
                            updatedAt: new Date(),
                        },
                    );
            } catch (err) {
                console.error(`⚠️ Firestore update status failed (manual will fail): ${err.message}`);
            }
        }
        msg += `✅ finished upload the finish of the process`;
    } catch (err) {
        throw new Error(`❌ Firestore add into record failed: ${err.message} for ${orderId}`);
    }

    console.log(msg)

} catch (err) {
    console.log("❌ Error:", err.message);
    console.log(err.stack);
} finally {
    if (db) {
        try {
            await db.close();
        } catch (err) {
            console.log("⚠️ Failed to close SQLite DB:", err.message);
        }
    }
}
