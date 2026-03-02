import * as duckdb from "@duckdb/duckdb-wasm";

export type DuckBundle = {
  db: duckdb.AsyncDuckDB;
  conn: duckdb.AsyncDuckDBConnection;
};

export async function initDb() {
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());

  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}")`], {
      type: "text/javascript",
    }),
  );
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);

  const conn = await db.connect();
  return { db, conn };
}

export async function ingestFile({ db, conn }: DuckBundle, file: File) {
  const ext = file.name.split(".").pop()!.toLowerCase();
  const vfsName = `${Date.now()}_${file.name}`;
  const buffer = new Uint8Array(await file.arrayBuffer());

  db.registerFileBuffer(vfsName, buffer);

  let query = "";
  switch (ext) {
    case "csv":
      query = `CREATE OR REPLACE TABLE uploaded AS SELECT * FROM read_csv_auto('${vfsName}')`;
      break;
    case "json":
      query = `CREATE OR REPLACE TABLE uploaded AS SELECT * FROM read_json_auto('${vfsName}')`;
      break;
    case "parquet":
      query = `CREATE OR REPLACE TABLE uploaded AS SELECT * FROM parquet_scan('${vfsName}')`;
      break;
    case "xlsx":
      await conn.query("INSTALL excel; LOAD excel;");
      query = `CREATE OR REPLACE TABLE uploaded AS SELECT * FROM read_excel('${vfsName}')`;
      break;
    default:
      throw new Error("Unsupported file type");
  }

  await conn.query(query);
  return (await conn.query(`SELECT * FROM uploaded`)).toArray();
}
