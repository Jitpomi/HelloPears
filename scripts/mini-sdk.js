import {EventEmitter} from 'events';
import Hyperbee from 'hyperbee';


export const DEFAULT_JOIN_OPTS = {
  server: true,
  client: true
}

const options = {
  defaultCoreOpts:{},
  defaultJoinOpts:DEFAULT_JOIN_OPTS,
}
export default class MiniSdk extends EventEmitter {
  constructor(options) {
    super();
    this.name= options.name
    this.swarm = options.swarm
    this.corestore = options.corestore

    // These probably shouldn't be accessed
    this.coreCache = new Map()
    this.beeCache = new Map()
    this.driveCache = new Map()

    this.defaultCoreOpts = options.defaultCoreOpts
    this.defaultJoinOpts = options.defaultJoinOpts

      options.swarm.on('connection', (connection, peerInfo) => {
        this.emit('peer-add', peerInfo)
        connection.once('close', () => this.emit('peer-remove', peerInfo))
        this.replicate(connection)
      })

  }

  get publicKey () {
    return this.swarm.keyPair.publicKey
  }

  get connections () {
    return this.swarm.connections
  }

  get peers () {
    return this.swarm.peers
  }

  async getBee (nameOrKeyOrURL, opts = {}) {
    const core = await this.get(nameOrKeyOrURL, opts)

    if (this.beeCache.has(core.url)) {
      return this.beeCache.get(core.url)
    }

    const bee = new Hyperbee(core, opts)

    core.once('close', () => {
      this.beeCache.delete(core.url)
    })

    this.beeCache.set(core.url, bee)

    await bee.ready()

    return bee
  }

  async get (nameOrKeyOrURL, opts = {}) {
    const coreOpts = {
      ...this.defaultCoreOpts,
      autoJoin: this.autoJoin,
      ...opts
    }


    if (this.coreCache.has(this.name)) {
      return this.coreCache.get(this.name)
    }

    Object.assign(coreOpts, {name: this.name})

    // There shouldn't be a way to pass null for the key
    const core = this.corestore.get(coreOpts)

    // Await for core to be ready
    await core.ready()

    core.once('close', () => {
      this.coreCache.delete(this.name)
    })

    if (this.name) this.coreCache.set(this.name, core)

    if (coreOpts.autoJoin && !core.discovery) {
      await this.joinCore(core, opts)
    }

    return core
  }

  // Returns a corestore for a namespace
  namespace (namespace) {
    return this.corestore.namespace(namespace)
  }

  makeTopicKey (name) {
    const [key] = crypto.namespace(name, 1)
    return key
  }

  async joinCore (core, opts = {}) {
    if (core.discovery) return
    const discovery = this.join(core.discoveryKey, opts)
    core.discovery = discovery

    // If we're the owner, then we wait until is fully announced
    if (core.writable) {
      await discovery.flushed()
    }

    // Await for initial peer for new readable cores
    if (!core.writable && !core.length) {
      const done = core.findingPeers()
      this.swarm.flush().then(done)
      await core.update()
    }

    core.once('close', () => {
      discovery.destroy()
    })
  }

  join (topic, opts = {}) {
    if (typeof topic === 'string') {
      return this.join(this.makeTopicKey(topic), opts)
    }
    const joinOpts = { ...this.defaultJoinOpts, ...opts }
    return this.swarm.join(topic, joinOpts)
  }

  leave (topic) {
    if (typeof topic === 'string') {
      return this.leave(this.makeTopicKey(topic))
    }
    return this.swarm.leave(topic)
  }

  joinPeer (id) {
    return this.swarm.joinPeer(id)
  }

  leavePeer (id) {
    return this.swarm.leavePeer(id)
  }

  async ready () {
    // Wait for the network to be configured?
    await this.corestore.ready()
    await this.swarm.listen()
  }

  async close () {
    // Close corestore, close hyperswarm
    await Promise.all([
      this.corestore.close(),
      this.swarm.destroy()
    ])
  }

  replicate (connection) {
    this.corestore.replicate(connection)
  }

}
