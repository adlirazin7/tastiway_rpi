import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import serviceAccount from "./service_account-cp4.json" with { type: "json" };
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";


// retrieve the custom machine Id 
const machineId = fs.readFileSync('/etc/machine_id_custom', 'utf8').trim();

const combined = process.argv[2];
console.log("combined:", combined)
const [orderId, reject] = combined.split(",-,");
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




    // update sqlite -- table tastiway-process
    try {
        const currentRows = await db.all(`SELECT * FROM current LIMIT 1;`);
        const currentRow = currentRows[0]
        if (orderId === currentRow['orderId']) {
            await db.run(
                `UPDATE tastiway_process
                SET stop = ?, counts = ?, reject = ?
                WHERE orderId = ?`,
                [nowMillis, currentRow['counts'], reject, orderId]
            );
        } else {
            console.log("❌ orderId inside current and in the flow are different !!!")
        }
        // clear the current table
        await db.run("DELETE FROM current;");
    } catch (err) {
        throw new Error(`❌ 'tastiway_process' table handling failed: ${err.message}`);
    }

    // Sqlilte -- add the last data to table log -- make sure to clear the orderId first to prevent from race condition with the log updater
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
    } catch (err) {
        throw new Error(`❌ Update 'log' table failed: ${err.message}`);
    }

    // Firestore -- update status
    try {
        await dbFirestore
            .collection("tastiway_plans")
            .doc(orderId)
            .set(
                {
                    status: "completed",
                    updatedAt: new Date(),
                },
                { merge: true }
            );
    } catch (err) {
        throw new Error(`❌ Firestore update status failed: ${err.message}`);
    }



    //Firestore -- add collection 'reports'
    try {
        const orders = await db.all(`SELECT * FROM tastiway_process WHERE orderId = ?`, [orderId]);
        const plan = await db.all(`SELECT * FROM tastiway_plan WHERE orderId=?`, [orderId])
        if (orders.length === 0) {
            throw new Error(`${orderId} is not exist in the tastiway_process table`);
        }
        const order = orders[0]
        let expectedQuantity;
        let productName;

        if (plan.length === 0) {
            expectedQuantity = 0;
            productName = ""
        } else {
            expectedQuantity = plan[0]["quantity"]
            productName = plan[0]["productName"]
        }
        // retrieve the andon array for that period from count_logs
        await dbFirestore
            .collection("tastiway_reports")
            .doc(orderId)
            .update(
                {
                    stop: Timestamp.fromMillis(order["stop"]),
                    finalCount: order["counts"],
                    reject: expectedQuantity - order["reject"],
                    name: productName,
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
        throw new Error(`❌ Firestore add into record failed: ${err.message} for ${orderId}`);
    }

    // Firestore -- update ANDON signal system
    try {
        await dbFirestore
            .collection("tastiway_machines")
            .doc(machineId)
            .set(
                {
                    status: "yellow",
                    lastSeen: new Date(),
                },
                { merge: true }
            );
    } catch (err) {
        throw new Error(`❌ Firestore update Andon status failed: ${err.message}`);
    }

    console.log(`✅ process finished, sqlite and firestore been successfully updated`)
    console.log(
        JSON.stringify({
            status: "success",
            orderId,
        })
    );

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
