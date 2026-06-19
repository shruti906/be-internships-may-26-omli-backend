import Database from 'better-sqlite3';
const db = new Database(':memory:');
db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, k TEXT UNIQUE)');
db.prepare('INSERT INTO t (k) VALUES (?)').run('a');
try {
  db.prepare('INSERT INTO t (k) VALUES (?)').run('a');
} catch (err) {
  console.log('Error code:', err.code);
}
