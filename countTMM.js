import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";

// retrieve the custom machine Id
const machineId = fs.readFileSync("/etc/machine_id_custom", "utf8").trim();
const config = fs.readFileSync("/home/pi/config.json", "utf8").trim();

const dbPath = "/home/pi/Project/tastiway.db";

const db = await open({
  filename: dbPath,
  driver: sqlite3.Database,
});

try {
  const { kgperhour, threshold } = JSON.parse(config);

  const currentRow = await db.all(`SELECT * FROM current LIMIT 1;`);

  if (currentRow.length === 0) {
    console.log("NO PROCESS IS RUNNING >:c");

  }

  const startTime = currentRow.start;

  const arr = await db.all(
    `SELECT kw FROM energy_reading WHERE timestamp >= ? ORDER BY timestamp ASC`,
    [startTime],
  );


  console.log(arr);

  const len = arr.length;

  if (len < 2) {
    if (len === 0) {
      console.log("ENERGY READING EMPTY");
    }
    console.log("NOT ENOUGH ITEMS TO CALCULATE");

  }

  const onArr = [];

  for (let i = 0; i < len; i++) {
    const element = arr[i];
    if (element.kw > threshold) {
      onArr.push(element);
    }
  }

  // WE ASSUME 20 SECONDS MODBUS SAMPLING RATE
  const totalTimeOn = onArr.length * 20;
  const totalCount = (totalTimeOn / 3600) * kgperhour;
  console.log(totalCount)
  await fetch("http://localhost:6018/tmm_count", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      count: totalCount ?? 0
    })

  })



} catch (error) {
  console.log(error);

}
