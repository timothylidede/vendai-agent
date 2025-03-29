import { readFileSync, readdirSync } from "fs";
import ollama from "ollama";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";


// instantiante database
const db = new Database("embedblob.db");
const sessionKey = "testUser";
db.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      sessid TEXT,
      name TEXT,
      content TEXT,
      embeddings BLOB
    );

    PRAGMA journal_mode = WAL;  -- Better write performance
  `);


// define functions

/**
 * 
 * @param {embeddings} embeddings 
 * @param {Object} meta 
 * @param {string} content 
 */
async function saveToDb(embeddings, meta, content) {
    //   console.log(meta, embeddings)
    const transaction = db.transaction(() => {
      const stmt = db.prepare(`
          INSERT INTO embeddings
          VALUES (?, ?, ?, ?, ?)
        `);
      const id = uuidv4()
      stmt.run(id,meta.session, meta.name, content, embeddings);
    });
  
    transaction();
}
  
  
  
/**
 *
 * @param {string} content
 * @param {Object} meta
 */
async function Embed(content, meta) {
//   console.log(meta, content.substring(0, 20))

const res = await ollama.embed({
    model: "mxbai-embed-large",
    truncate: true,
    input: content,
});
// console.log(res.model, res.embeddings.flat(), meta)
meta.model = res.model;
const f = new Float32Array(res.embeddings.flat())
saveToDb(f, meta, content);
}


// read files and embed them
let data = {};
const files = readdirSync(`./data`);
for (const f of files) {
    const content = readFileSync(`./data/${f}`, "utf-8");
    Embed(content, { session: sessionKey, name: f });
}