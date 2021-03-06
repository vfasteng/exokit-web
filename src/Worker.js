// const {URL} = url;
// const vm = require('vm');

// import {createImageBitmap} from './DOM.js';
// const WebSocket = require('ws/lib/websocket');
// const {FileReader} = require('./File.js');
import GlobalContext from './GlobalContext.js';

const {src, options: {baseUrl}} = GlobalContext.workerData.args;
GlobalContext.baseUrl = baseUrl;

const _normalizeUrl = src => {
  if (!/^(?:file|data|blob):/.test(src)) {
    return new URL(src, baseUrl).href;
  } else {
    return src;
  }
};
const filename = _normalizeUrl(src);

// global.self = global;
// global.addEventListener = (type, fn) => global.on(type, fn);
// global.removeEventListener = (type, fn) => global.removeListener(type, fn);
self.location = url.parse(filename);
// global.WebSocket = WebSocket;
// global.importScripts = importScripts;
// self.createImageBitmap = createImageBitmap;
// global.FileReader = FileReader;

/* global.on('error', err => {
  const {onerror} = global;
  onerror && onerror(err);
}); */

/* const _handleError = err => {
  if (global.onerror) {
    global.onerror(err);
  }
};
process.on('uncaughtException', _handleError);
process.on('unhandledRejection', _handleError); */

/* const exp = getScript(filename);
vm.runInThisContext(exp, {
  filename: /^https?:/.test(filename) ? filename : 'data-url://',
}); */
// process.nextTick(() => { // importScripts will block, so make sure we are done setup first
  importScripts(filename);
// });
