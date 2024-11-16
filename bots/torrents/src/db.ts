import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import expandTilde from 'expand-tilde';
import path from 'node:path';

const dbFile = 'topics.db';
const dbPath = path.join('~/.config/torrents', dbFile);
const dbFullPath = expandTilde(dbPath);

export type Topic = {
  title: string,
  publishDate: string,
  guid: string,
}

const tableName = 'topic';
const createTopicTable = `CREATE TABLE IF NOT EXISTS ${tableName} (
  guid TEXT UNIQUE,
  publishDate TEXT
)`;
const singleTopic = `SELECT guid, publishDate FROM ${tableName} WHERE guid = ?`;
const addTopic = `INSERT INTO ${tableName} (guid, publishDate) VALUES (?, ?)`;
const updateTopic = `UPDATE ${tableName} SET publishDate = ? WHERE guid = ?`;

export class DB {
  private readonly db: Promise<Database>;

  constructor() {
    this.db = open({
      filename: dbFullPath,
      driver: sqlite3.Database,
    });
  }

  async init() {
    const db = await this.db;

    db.exec(createTopicTable);
  }

  async findTopic(guid: string): Promise<Topic | undefined> {
    await this.init();
    const db = await this.db;

    return db.get(singleTopic, guid);
  }

  async addTopic(guid: string, publishDate: string): Promise<void> {
    await this.init();
    const db = await this.db;

    await db.run(addTopic, guid, publishDate);
  }

  async updateTopic(guid: string, publishDate: string): Promise<void> {
    await this.init();
    const db = await this.db;

    await db.run(updateTopic, publishDate, guid);
  }
}
