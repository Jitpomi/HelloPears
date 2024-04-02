# HelloPears
A desktop version of [Hello Peers](https://github.com/jermsam/hello-peers) running on Holepunch's recently released [PEER RUNTIME](https://pears.com/)
## Key Differences:
1. No need for a relay websocket server
2. For Native apps
3. Uses Pear Runtime Scripts:
- pear stage <channel|key> [dir] - for a diff of changes, almost same as git add . + git commit ...
- pear seed <channel|key> [dir] -  for announcing the app, so other pears can run it, almost same as git push ...
- pear run <key> - load the application directly peer-to-peer, almost git clone ...
## Similarities:
Almost every thing else is the same as it was in the web app demo
1. create a corestore at a given storage - RAM used here
```js
const storage = RAM.reusable()
const store = new Corestore(storage)
```
2. create an autobase using that store
```js
const local = new Autobase(store, null, { apply, open })
await local.ready()
```
3. using the todo topic, get the discovery core from the store
```js
const name='todo'
 const topic = await crypto.subtle.digest('SHA-256', b4a.from(name, 'hex')).then(b4a.from);
  const core = store.get(topic)
  await core.ready()
```
4. create the swarm and replicate the store on connection
```js
 const peerDiscoverySession = swarm.join(core.discoveryKey, { client: true, server: true })
  swarm.on('connection', conn => store.replicate(conn))
```
5. If the core is a local store and is writable, wait for it to be announced, otherwise for initial peer for new readable cores
```js
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
```
6. From the autobase create an indexed db using Heperbeedeebee
```js
  const localBee = new Autodeebee(autobase);
  await localBee.ready();
  const db = new DB(localBee);
```
7. Then create an extention of the core to handle new connections
```js
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
```



