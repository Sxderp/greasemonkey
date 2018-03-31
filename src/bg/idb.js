/* Cached indexedDB connections */

(function() {

const connections = {};


// @internal
function connect(name, version, dbKey, options) {
  let dbOpen = indexedDB.open(name, version);
  let dbP = new Promise((resolve, reject) => {
    dbOpen.onsuccess = event => {
      wrapDb(dbKey, dbOpen.result);
      resolve(dbOpen.result);
    };
    dbOpen.onerror = event => {
      reject(dbOpen.error);
    };
    if (typeof options['onupgrade'] === 'function') {
      dbOpen.onupgradeneeded = options['onupgrade'].bind(null, reject);
    }
  });
  connections[dbKey] = {'dbP': dbP};
  return dbP;
}


// @internal
function wrapDb(dbKey, db) {
  db._key = dbKey;
  db.origClose = db.close;
  db.close = (() => {
    clearTimer(db);
    delete connections[db._key];
    db.origClose();
  });
}


// @internal
function clearTimer(db) {
  let conn = connections[db._key];
  if (conn) clearTimeout(conn.timeout);
}


// Refresh a database closing timer
function setTimer(options, db) {
  clearTimer(db);
  connections[db._key] = {
    'db': db,
    'timeout': setTimeout(db.close, options['timeout'] || 2000)
  };
  return db;
}


function open(name, version, options) {
  options = options || {};

  let dbKey = JSON.stringify([name, version]);
  let conn = connections[dbKey];
  if (conn && conn.db) {
    // Use existing database connection
    return Promise.resolve(setTimer(options, conn.db));
  } else if (conn) {
    // Wait for an opening connection
    return conn.dbP.then(setTimer.bind(null, options));
  } else {
    // Open a new connection
    return connect(name, version, dbKey, options)
        .then(setTimer.bind(null, options));
  }
}


// Delete a database. First checks if it is open, closes it, then deletes.
async function remove(name, version) {
  let dbKey = JSON.stringify([name, version]);
  let conn = connections[dbKey];

  if (conn && conn.db) {
    conn.db.close();
  } else if (conn) {
    await conn.dbP;
    conn.db.close();
  }

  let deleteReq = indexedDB.deleteDatabase(name);
  return new Promise((resolve, reject) => {
    deleteReq.onsuccess = event => {
      console.log('successfully deleted db', name);
      resolve();
    };
    deleteReq.onerror = event => {
      console.log('errored while deleting db', name);
      reject(deleteReq.error);
    };
    deleteReq.onblocked = event => {
      console.log('blocked while deleting db', name);
    };
  });
}


window.idb = {
  open,
  remove,
};

})();
