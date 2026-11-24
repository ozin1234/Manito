import { createHash } from "node:crypto";
const missing = () => Object.assign(new Error("Record not found"), { code: "ENOENT" });
const existing = () => Object.assign(new Error("Record already exists"), { code: "EEXIST" });
const leaseLost = () => Object.assign(new Error("Storage write lease expired"), { code: "LEASE_EXPIRED" });
const normalize = value => String(value).replaceAll("\\", "/");
export function cloudStorage(db, bucket, lease) {
  const guardSql = "EXISTS (SELECT 1 FROM kroad_leases WHERE name='writer' AND owner=? AND expires_at>?)";
  async function guard() {
    if (!lease || !(await db.prepare("SELECT owner FROM kroad_leases WHERE name='writer' AND owner=? AND expires_at>?").bind(lease, Date.now()).first())) throw leaseLost();
  }
  return {
    async mkdir() {},
    async readFile(path, encoding) {
      const key = normalize(path);
      let bytes;
      if (key.endsWith(".json") || key.endsWith(".tmp")) {
        const row = await db.prepare("SELECT content FROM kroad_records WHERE key=?").bind(key).first();
        if (!row) throw missing();
        let data = row.content;
        const value = JSON.parse(data);
        if (value._kroadPhotoObject) {
          const image = await bucket.get(value._kroadPhotoObject);
          if (!image) throw missing();
          value.photoDataUrl = await image.text(); delete value._kroadPhotoObject; data = JSON.stringify(value);
        }
        bytes = Buffer.from(data);
      } else {
        const image = await bucket.get("files" + key);
        if (!image) throw missing();
        bytes = Buffer.from(await image.arrayBuffer());
      }
      return encoding ? bytes.toString(typeof encoding === "string" ? encoding : encoding.encoding ?? "utf8") : bytes;
    },
    async writeFile(path, data, options = {}) {
      await guard();
      const key = normalize(path);
      if (!key.endsWith(".json") && !key.endsWith(".tmp")) {
        const objectKey = "files" + key;
        if (options.flag === "wx" && await bucket.head(objectKey)) throw existing();
        await bucket.put(objectKey, data);
        await guard(); return;
      }
      const value = JSON.parse(String(data));
      if (value.photoDataUrl) {
        const imageKey = "private-session-photos/" + createHash("sha256").update(value.photoDataUrl).digest("hex");
        await bucket.put(imageKey, value.photoDataUrl);
        value._kroadPhotoObject = imageKey; delete value.photoDataUrl;
      }
      const sql = options.flag === "wx"
        ? `INSERT OR IGNORE INTO kroad_records(key,content,updated_at) SELECT ?,?,? WHERE ${guardSql}`
        : `INSERT INTO kroad_records(key,content,updated_at) SELECT ?,?,? WHERE ${guardSql} ON CONFLICT(key) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at`;
      const result = await db.prepare(sql).bind(key, JSON.stringify(value), Date.now(), lease, Date.now()).run();
      if (!result.meta.changes) { await guard(); throw existing(); }
    },
    async rename(from, to) {
      await guard(); from = normalize(from); to = normalize(to);
      const results = await db.batch([
        db.prepare(`INSERT INTO kroad_records(key,content,updated_at) SELECT ?,content,updated_at FROM kroad_records WHERE key=? AND ${guardSql} ON CONFLICT(key) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at`).bind(to, from, lease, Date.now()),
        db.prepare(`DELETE FROM kroad_records WHERE key=? AND ${guardSql}`).bind(from, lease, Date.now()),
      ]);
      if (!results[0].meta.changes) { await guard(); throw missing(); }
    },
    async readdir(path) {
      const prefix = normalize(path).replace(/\/$/, "") + "/";
      const rows = await db.prepare("SELECT key FROM kroad_records WHERE substr(key,1,?)=?").bind(prefix.length, prefix).all();
      return rows.results.map(row => row.key.slice(prefix.length)).filter(name => name && !name.includes("/"));
    },
    async unlink(path) {
      await guard();
      const result = await db.prepare(`DELETE FROM kroad_records WHERE key=? AND ${guardSql}`).bind(normalize(path), lease, Date.now()).run();
      if (!result.meta.changes) { await guard(); throw missing(); }
    },
    async stat(path) {
      const row = await db.prepare("SELECT content,updated_at FROM kroad_records WHERE key=?").bind(normalize(path)).first();
      if (!row) throw missing();
      return { mtimeMs: row.updated_at, size: Buffer.byteLength(row.content) };
    },
  };
}
