import {EventTarget} from './Event.js';
import path from '../modules/path-browserify.js';
import GlobalContext from './GlobalContext.js';

const workerScriptPath = `${import.meta.url.replace(/[^\/]+$/, '')}WindowBase.js`;

class WorkerVm extends EventTarget {
  constructor(options = {}) {
    super();

    const worker = new Worker(workerScriptPath, {
      type: 'module',
    });
    worker.postMessage({
      method: 'init',
      workerData: {
        initModule: options.initModule,
        args: options.args,
      },
    });
    const _message = e => {
      const {data: m} = e;
      switch (m.method) {
        case 'request': {
          this.dispatchEvent(new CustomEvent('request', {
            detail: m,
          }));
          break;
        }
        case 'response': {
          const fn = this.queue[m.requestKey];

          if (fn) {
            fn(m.error, m.result);
            delete this.queue[m.requestKey];
          } else {
            console.warn(`unknown response request key: ${m.requestKey}`);
          }
          break;
        }
        case 'postMessage': {
          this.dispatchEvent(new CustomEvent('message', {
            detail: m,
          }));
          break;
        }
        case 'emit': {
          const {type, event} = m;
          const e = new CustomEvent(m.type);
          for (const k in event) {
            e[k] = event[k];
          }
          this.dispatchEvent(e);
          break;
        }
        case 'load': {
          this.dispatchEvent(new CustomEvent('load'));
          break;
        }
        case 'error': {
          const {error} = m;
          this.dispatchEvent(new ErrorEvent('error', {
            error,
          }));
          break;
        }
        default: {
          throw new Error(`worker got unknown message: '${JSON.stringify(m)}'`);
          break;
        }
      }
    };
    worker.addEventListener('message', _message);
    worker.addEventListener('load', () => {
      this.dispatchEvent(new CustomEvent('load'));
    });
    worker.addEventListener('error', err => {
      this.dispatchEvent(new ErrorEvent({
        error: err,
      }));
    });
    worker.cleanup = () => {
      worker.removeEventListener('message', _message);
    };
    this.worker = worker;

    this.requestKeys = 0;
    this.queue = {};
  }

  queueRequest(fn) {
    const requestKey = this.requestKeys++;
    this.queue[requestKey] = fn;
    return requestKey;
  }

  runRepl(jsString, transferList) {
    return new Promise((accept, reject) => {
      const requestKey = this.queueRequest((err, result) => {
        if (!err) {
          accept(result);
        } else {
          reject(err);
        }
      });
      this.worker.postMessage({
        method: 'runRepl',
        jsString,
        requestKey,
      }, transferList);
    });
  }
  runAsync(request, transferList) {
    return new Promise((accept, reject) => {
      const requestKey = this.queueRequest((err, result) => {
        if (!err) {
          accept(result);
        } else {
          reject(err);
        }
      });
      this.worker.postMessage({
        method: 'runAsync',
        request,
        requestKey,
      }, transferList);
    });
  }
  postMessage(message, transferList) {
    this.worker.postMessage({
      method: 'postMessage',
      message,
    }, transferList);
  }
  emit(type, event) {
    this.worker.postMessage({
      method: 'emit',
      type,
      event,
    });
  }
  
  destroy() {
    this.worker.terminate();
    this.worker.cleanup();
    this.worker = null;
  }

  get onmessage() {
    return this.worker.onmessage;
  }
  set onmessage(onmessage) {
    this.worker.onmessage = onmessage;
  }
  get onerror() {
    return this.worker.onerror;
  }
  set onerror(onerror) {
    this.worker.onerror = onerror;
  } 
}

const _clean = o => {
  const result = {};
  for (const k in o) {
    const v = o[k];
    if (typeof v !== 'function') {
      result[k] = v;
    }
  }
  return result;
};
const _makeWindow = (options = {}, handlers = {}) => {
  const id = Atomics.add(GlobalContext.xrState.id, 0, 1) + 1;
  const window = new WorkerVm({
    initModule: './Window.js',
    args: {
      options: _clean(options),
      id,
      args: GlobalContext.args,
      version: GlobalContext.version,
      xrState: GlobalContext.xrState,
    },
  });
  window.id = id;
  window.loaded = false;
  // window.framebuffer = null;
  // window.phase = 0; // XXX
  // window.rendered = false;
  // window.promise = null;
  // window.syncs = null;

  window.evalAsync = scriptString => window.runAsync({method: 'eval', scriptString});

  /* window.on('resize', ({width, height}) => {
    // console.log('got resize', width, height);
    window.width = width;
    window.height = height;
  });
  window.on('framebuffer', framebuffer => {
    // console.log('got framebuffer', framebuffer);
    window.document.framebuffer = framebuffer;
  }); */
  window.addEventListener('navigate', ({href}) => {
    window.destroy()
      // .then(() => {
        options.onnavigate && options.onnavigate(href);
      /* })
      .catch(err => {
        console.warn(err.stack);
      }); */
  });
  window.addEventListener('request', e => {
    const {detail: req} = e;
    req.keypath.push(id);
    options.onrequest && options.onrequest(req);
  });
  /* window.addEventListener('framebuffer', e => {
    const {detail: framebuffer} = e;
    window.framebuffer = framebuffer;
  }); */
  window.addEventListener('pointerLock', e => {
    options.onpointerlock && options.onpointerlock(e.detail);
  });
  window.addEventListener('hapticPulse', e => {
    options.onhapticpulse && options.onhapticpulse(e.detail);
  });
  window.addEventListener('paymentRequest', e => {
    options.onpaymentrequest && options.onpaymentrequest(e.detail);
  });
  window.addEventListener('load', () => {
    window.loaded = true;
  }, {
    once: true,
  });
  /* window.addEventListener('error', err => {
    console.warn(err.stack);
  }); */
  window.destroy = (destroy => function() {
    destroy.apply(this, arguments);
    GlobalContext.windows.splice(GlobalContext.windows.indexOf(window), 1);

    const ks = Object.keys(window.queue);
    if (ks.length > 0) {
      const err = new Error('cancel request: window destroyed');
      err.code = 'ECANCEL';
      for (let i = 0; i < ks.length; i++) {
        window.queue[ks[i]](err);
      }
    }
    window.queue = null;

    // return Promise.resolve();
  })(window.destroy);
  
  GlobalContext.windows.push(window);

  return window;
};

export {
  WorkerVm,
  _makeWindow,
};
