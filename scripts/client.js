import b4a from 'b4a';
import {RangeWatcher} from '@lejeunerenard/hyperbee-range-watcher-autobase';
import {BSON} from 'bson';
import {createMultiWriterDB} from './db.js';
import {setTodo, createTodo, configTodo} from './app.js';

let resolveReady;
const ready = new Promise(resolve => (resolveReady = resolve));
ready.then(_ => console.log('all set up'));

const appName = 'todo';

const db = await createMultiWriterDB({name: appName})
//
const todoCollection = db.collection(appName)
resolveReady()
//
createWatcher()

export function addTodo(todo) {
  ready.then(() => todoCollection.insert(todo))
}

export function toggleTodo(_id) {
  return todoCollection.find({ _id }).then(([todo]) => {
    if (todo.done) return todoCollection.update({ _id }, { done: false })
    else return todoCollection.update({ _id }, { done: true })
  })
}

export function deleteTodo(_id) {
  return todoCollection.delete({ _id })
}

function createWatcher() {
  return new RangeWatcher(db.autobase.view, {}, undefined, updateStream)
}

async function updateStream(node) {
  const { key, value, type } = node
  if (b4a.includes(key, 'doc')) {
    const doc = BSON.deserialize(value)
    const todoElement = document.getElementById(doc._id.toString())
    if (type === 'put') {
      if (!todoElement) return setTodo(doc)
      const toReplaceWith = createTodo(doc)
      if (todoElement.innerHTML === toReplaceWith.innerHTML) return
      todoElement.replaceWith(toReplaceWith)
      configTodo(doc)
    }
    if (type === 'del') {
      todoElement.remove()
    }
  }
}
