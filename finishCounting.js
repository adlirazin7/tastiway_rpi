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
    const nowMillis = Date.now();
    try {
        const currentRow = await db.all(`SELECT * FROM current LIMIT 1;`);
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
        const order = await db.all(`SELECT * FROM tastiway_process WHERE orderId = ?`, [orderId]);
        if (order.length === 0) {
            throw new Error(`${orderId} is not exist in the tastiway_process table`);
        }
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
