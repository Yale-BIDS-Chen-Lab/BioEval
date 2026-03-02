import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";

import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";

const accessKey = process.env.MINIO_ROOT_USER!;
const secretKey = process.env.MINIO_ROOT_PASSWORD!;

function s3Path(bucket: string, key: string) {
  return `s3://${bucket}/${key}`;
}

export class S3Connection {
  private filePath!: string;
  private instance!: DuckDBInstance;
  public con!: DuckDBConnection;

  async connect(): Promise<this> {
    this.filePath = join(tmpdir(), `duckdb_${randomUUID()}.db`);
    this.instance = await DuckDBInstance.create(this.filePath);
    this.con = await this.instance.connect();
    await this.setup();
    return this;
  }

  private async setup() {
    await this.con.run("INSTALL httpfs;");
    await this.con.run("LOAD httpfs;");
    await this.con.run(`SET s3_access_key_id='${accessKey}';`);
    await this.con.run(`SET s3_secret_access_key='${secretKey}';`);
    await this.con.run(`SET s3_region='us-east-1';`);
    await this.con.run(`SET s3_url_style='path';`);
    await this.con.run(`SET s3_endpoint='minio:9000';`);
    await this.con.run(`SET s3_use_ssl=false;`);
  }

  async createTable(tableName: string, objectKey: string, tableAlias?: string) {
    console.log("creating table:", tableAlias ?? tableName);
    await this.con.run(
      `CREATE TEMP TABLE "${
        tableAlias ?? tableName
      }" AS SELECT * FROM '${s3Path(tableName, objectKey)}';`
    );
  }

  async dispose() {
    try {
      this.con?.closeSync();
    } finally {
      this.instance?.closeSync();
      if (this.filePath) await fs.unlink(this.filePath).catch(() => {});
    }
  }
}
