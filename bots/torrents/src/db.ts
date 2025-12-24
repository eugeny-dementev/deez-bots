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
  lastCheckDate: string,
  guid: string,
}

const tableName = 'topic';
const createTopicTable = `CREATE TABLE IF NOT EXISTS ${tableName} (
  guid TEXT UNIQUE NOT NULL,
  publishDate TEXT NOT NULL,
  lastCheckDate TEXT
)`;
const singleTopic = `SELECT guid, publishDate, lastCheckDate FROM ${tableName} WHERE guid = ?`;
const addTopic = `INSERT INTO ${tableName} (guid, publishDate) VALUES (?, ?)`;
const updatePubDateTopic = `UPDATE ${tableName} SET publishDate = ? WHERE guid = ?`;
const updateLastCheckDateTopic = `UPDATE ${tableName} SET lastCheckDate = ? WHERE guid = ?`;
const deleteAllTopics = `DELETE FROM ${tableName}`;

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

  async findTopic(guid: Topic['guid']): Promise<Topic | undefined> {
    await this.init();
    const db = await this.db;

    return db.get(singleTopic, guid);
  }

  async addTopic(guid: Topic['guid'], publishDate: Topic['publishDate']): Promise<void> {
    await this.init();
    const db = await this.db;

    await db.run(addTopic, guid, publishDate);
  }

  async updatePubDateTopic(guid: Topic['guid'], publishDate: Topic['publishDate']): Promise<void> {
    await this.init();
    const db = await this.db;

    await db.run(updatePubDateTopic, publishDate, guid);
  }

  async updateLastCheckDateTopic(guid: Topic['guid'], lastCheckDate: Topic['lastCheckDate']) {
    await this.init();
    const db = await this.db;

    await db.run(updateLastCheckDateTopic, lastCheckDate, guid);
  }

  async cleanupTopics(allowedGuids: Topic['guid'][]): Promise<number> {
    await this.init();
    const db = await this.db;

    if (allowedGuids.length === 0) {
      const result = await db.run(deleteAllTopics);
      return result.changes ?? 0;
    }

    const placeholders = allowedGuids.map(() => '?').join(',');
    const sql = `DELETE FROM ${tableName} WHERE guid NOT IN (${placeholders})`;
    const result = await db.run(sql, ...allowedGuids);
    return result.changes ?? 0;
  }
}
