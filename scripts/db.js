import { DB } from 'hyperdeebee';
import Autobase from 'autobase';
import b4a from 'b4a';
import goodbye from 'graceful-goodbye';
import { Autodeebee} from './autodeebee/index.js';
import Hyperbee from 'hyperbee';
import Corestore from 'corestore';
import RAM from 'random-access-memory';
import HyperSwarm from 'hyperswarm';

const defaultMultiWriterOpts = {
  extPrefix: '',
  name: 'db'
};

async function initDiscovery( store, name) {
  const topic = await crypto.subtle.digest('SHA-256', b4a.from(name, 'hex')).then(b4a.from);
  const core = store.get(topic)
  await core.ready()
  const swarm = new HyperSwarm();

  const peerDiscoverySession = swarm.join(core.discoveryKey, { client: true, server: true })

  swarm.on('connection', conn => store.replicate(conn))

  // If we're the owner, then we wait until is fully announced
  if (core.writable) {
    console.log('discovering');
    await peerDiscoverySession.discovery.flushed()
  }

  // Await for initial peer for new readable cores
  if (!core.writable && !core.length) {
    console.log('discovering');
    const done = core.findingPeers()
    swarm.flush().then(done)
    await core.update()
  }

  core.once('close', () => {
    peerDiscoverySession.discovery.destroy()
  })

  core.on('peer-add', (peerInfo) => {
    console.log('new peer, peer:', peerInfo, 'peer count:', core.peers.length);
  });
  return core;
}

async function handleNewDbs(store,{dbs, DBCores, autobase, newDBExt} = {}) {
  let sawNew = false;
  for (const db of dbs) {
    if (typeof db !== 'string' || DBCores.has(db)) continue;
    DBCores.add(db);
    try {
      const core = await store.get(db);
      await autobase.append(core);
    } catch (e) {
      console.error('error adding db:', e);
    }
    sawNew = true;
  }
  if (sawNew) {
    newDBExt.broadcast(Array.from(DBCores));
    console.log('got new dbs message, current inputs count:', DBCores.size);
    console.log('autobase inputs count:', autobase.activeWriters);
    console.log('autobase status:', autobase.view.core);
  }
}

export async function getDb(store, { autobase, extPrefix = '', options = { primaryKey: undefined } } = {}) {
  const name = options.topic || 'Hello Todos';
  const core = await initDiscovery(store, name);

  const localBee = new Autodeebee(autobase);
  await localBee.ready();
  const db = new DB(localBee);

  const DBCores = new Set();
  DBCores.add(autobase.localWriter.core.id);

  const newDBExt = core.registerExtension(extPrefix + '-db-sync', {
    encoding: 'json',
    onmessage: async (dbs) => {
      await handleNewDbs(store,{
        dbs,
        DBCores,
        autobase,
        newDBExt
      });
    },
  });

  core.on('peer-add', () => {
    newDBExt.broadcast(Array.from(DBCores));
  });

  newDBExt.broadcast(Array.from(DBCores));
  db.autobase = autobase;

  return db;
}



export async function createMultiWriterDB({ extPrefix, name } = defaultMultiWriterOpts) {
  const storage = RAM.reusable()
  const store = new Corestore(storage)
  // there is no need to get the input and output cores as autobase does that for you now.

  const autobase = new Autobase(store,null,{
    // handle nodes
    apply: async (batch, view, base) => {
      // Add .addWriter functionality
      for (const node of batch) {
        const op = node.value
        if ('id' in op) {
          console.log('\rAdding writer', op.key)
          await base.addWriter(b4a.from(op.key, 'hex'))
        }
      }

      // Pass through to Autobee's apply
      await Autodeebee.apply(batch, view, base)
    },
    // create your Hyperbee (view)
    open: (store)=> {
      const core = store.get(name)
      return  new Hyperbee(core, {
        extension: false,
      })
    },
    close: (/*view*/) => {
      // ...
    }, // close the view
    valueEncoding: 'JSON', // encoding
    ackInterval: 1000 // enable auto acking with the interval
  });
  await autobase.ready();
  const db = await  getDb(store,  {autobase,extPrefix});
  goodbye(async () => {
    await db.close()
  })
  return db
}
