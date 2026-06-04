const { initializeApp } = require("firebase/app");
const { getDatabase, ref, set, get, update, push, onValue, onChildAdded, off, serverTimestamp, remove } = require("firebase/database");
const config = require("../config.json");
const chalk = require("chalk");

let firebaseApp = null;
let db = null;

function initFirebase() {
  if (firebaseApp) return { app: firebaseApp, db };

  try {
    firebaseApp = initializeApp(config.firebase);
    db = getDatabase(firebaseApp);
    console.log(chalk.green("✅ Firebase initialized successfully"));
    return { app: firebaseApp, db };
  } catch (err) {
    console.error(chalk.red("❌ Firebase initialization failed:"), err.message);
    throw err;
  }
}

function getDB() {
  if (!db) initFirebase();
  return db;
}

async function dbGet(path) {
  try {
    const database = getDB();
    const snap = await get(ref(database, path));
    return snap.exists() ? snap.val() : null;
  } catch (err) {
    console.error(`[Firebase] GET error at ${path}:`, err.message);
    return null;
  }
}

async function dbSet(path, value) {
  try {
    const database = getDB();
    await set(ref(database, path), value);
    return true;
  } catch (err) {
    console.error(`[Firebase] SET error at ${path}:`, err.message);
    return false;
  }
}

async function dbUpdate(path, value) {
  try {
    const database = getDB();
    await update(ref(database, path), value);
    return true;
  } catch (err) {
    console.error(`[Firebase] UPDATE error at ${path}:`, err.message);
    return false;
  }
}

async function dbPush(path, value) {
  try {
    const database = getDB();
    const snap = await push(ref(database, path), value);
    return snap.key;
  } catch (err) {
    console.error(`[Firebase] PUSH error at ${path}:`, err.message);
    return null;
  }
}

async function dbRemove(path) {
  try {
    const database = getDB();
    await remove(ref(database, path));
    return true;
  } catch (err) {
    console.error(`[Firebase] REMOVE error at ${path}:`, err.message);
    return false;
  }
}

function dbListen(path, callback) {
  const database = getDB();
  const r = ref(database, path);
  onValue(r, callback);
  return () => off(r, "value", callback);
}

function dbListenChild(path, callback) {
  const database = getDB();
  const r = ref(database, path);
  onChildAdded(r, callback);
  return () => off(r, "child_added", callback);
}

module.exports = {
  initFirebase,
  getDB,
  dbGet,
  dbSet,
  dbUpdate,
  dbPush,
  dbRemove,
  dbListen,
  dbListenChild,
  serverTimestamp
};
