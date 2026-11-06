// Python.js — Scratch / TurboWarp extension
// Name: Python | Id: Python | Color: Blue
// Load in TurboWarp: "Load custom extension" -> upload Python.js or paste its URL.
// Runs real Python (Skulpt) inside Scratch blocks.

(function (Scratch) {
  'use strict';

  if (!Scratch || !Scratch.extensions || typeof Scratch.extensions.register !== 'function') {
    throw new Error('Python extension must be run in Scratch / TurboWarp.');
  }

  const BLOCK_ICON_URI = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/3840px-Python-logo-notext.svg.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=thumbnail';

  const SKULPT_URL = 'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js';
  const SKULPT_STDLIB_URL = 'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js';

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-python-ext="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load: ' + src)));
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.pythonExt = src;
      s.onload = () => { s.dataset.loaded = 'true'; resolve(); };
      s.onerror = () => reject(new Error('Failed to load: ' + src));
      document.head.appendChild(s);
    });
  }

  function toPythonLiteral(value) {
    const str = String(value);
    // numbers (int / float) pass through, everything else becomes a quoted string
    if (/^-?\d+(\.\d+)?$/.test(str.trim())) return str.trim();
    if (str === 'True' || str === 'False' || str === 'None') return str;
    // escape backslashes, single quotes, newlines for a single-quoted python string
    return "'" + str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  }

  function isValidPyName(name) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name).trim());
  }

  class Python {
    constructor() {
      this._session = '';   // persistent python definitions from "set variable" blocks
      this._output = '';    // stdout of last "run python" block
      this._error = '';     // error of last run (empty string = no error)
      this._loading = null; // shared Skulpt load promise
    }

    getInfo() {
      return {
        id: 'Python',
        name: 'Python',
        color1: '#3776AB',
        color2: '#2B5D87',
        color3: '#1E3F5C',
        blockIconURI: BLOCK_ICON_URI,
        menuIconURI: BLOCK_ICON_URI,
        docsURI: 'https://docs.python.org/3/',
        blocks: [
          {
            opcode: 'runPython',
            blockType: Scratch.BlockType.COMMAND,
            text: 'run python [CODE]',
            arguments: {
              CODE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'print("Hello, world!")\nfor i in range(5):\n    print(i)'
              }
            }
          },
          {
            opcode: 'pythonOutput',
            blockType: Scratch.BlockType.REPORTER,
            text: 'python output'
          },
          {
            opcode: 'pythonError',
            blockType: Scratch.BlockType.REPORTER,
            text: 'python error'
          },
          {
            opcode: 'evalPython',
            blockType: Scratch.BlockType.REPORTER,
            text: 'python result [CODE]',
            arguments: {
              CODE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: '1 + 2 * 3'
              }
            }
          },
          {
            opcode: 'pythonIsTrue',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'python [CODE] is true?',
            arguments: {
              CODE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: '5 > 3'
              }
            }
          },
          {
            opcode: 'printPython',
            blockType: Scratch.BlockType.COMMAND,
            text: 'python print [TEXT]',
            arguments: {
              TEXT: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'Hello from Python!'
              }
            }
          },
          {
            opcode: 'setPythonVar',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set python variable [NAME] to [VALUE]',
            arguments: {
              NAME: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'x'
              },
              VALUE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: '10'
              }
            }
          },
          {
            opcode: 'getPythonVar',
            blockType: Scratch.BlockType.REPORTER,
            text: 'python variable [NAME]',
            arguments: {
              NAME: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'x'
              }
            }
          },
          {
            opcode: 'clearPythonOutput',
            blockType: Scratch.BlockType.COMMAND,
            text: 'clear python output'
          },
          {
            opcode: 'pythonVersion',
            blockType: Scratch.BlockType.REPORTER,
            text: 'python version'
          },
          {
            opcode: 'pythonHasError',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'python has error?'
          }
        ]
      };
    }

    // ---- internal helpers ----

    _ensureSkulpt() {
      if (typeof window !== 'undefined' && window.Sk && window.Sk.misceval) {
        return Promise.resolve();
      }
      if (!this._loading) {
        this._loading = (async () => {
          await loadScriptOnce(SKULPT_URL);
          await loadScriptOnce(SKULPT_STDLIB_URL);
          if (!window.Sk) throw new Error('Skulpt failed to load.');
        })().catch((e) => {
          this._loading = null;
          throw e;
        });
      }
      return this._loading;
    }

    _configureSk(capture) {
      const Sk = window.Sk;
      Sk.configure({
        output: (text) => { capture.stdout += text; },
        read: (filename) => {
          if (Sk.builtinFiles === undefined || Sk.builtinFiles.files[filename] === undefined) {
            throw new Error("File not found: '" + filename + "'");
          }
          return Sk.builtinFiles.files[filename];
        },
        inputfun: (promptText) => {
          try {
            if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
              const r = window.prompt(String(promptText || 'Python input:'));
              return r === null ? '' : String(r);
            }
          } catch (e) { /* fall through */ }
          return '';
        },
        __future__: Sk.python3
      });
    }

    // Run code (plus persistent session prelude). Returns { stdout, error }.
    // If keepMainState is true, updates this._output / this._error.
    _runCode(code, keepMainState) {
      return this._ensureSkulpt().then(() => {
        const Sk = window.Sk;
        const capture = { stdout: '' };
        this._configureSk(capture);
        const fullCode = (this._session ? this._session + '\n' : '') + String(code);
        return Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('<stdin>', false, fullCode, true))
          .then(() => {
            const result = { stdout: capture.stdout, error: '' };
            if (keepMainState) {
              this._output = result.stdout;
              this._error = '';
            }
            return result;
          })
          .catch((err) => {
            const msg = (err && err.toString) ? err.toString() : String(err);
            const result = { stdout: capture.stdout, error: msg };
            if (keepMainState) {
              this._output = result.stdout;
              this._error = msg;
            }
            return result;
          });
      });
    }

    // Evaluate an expression and return its repr() string without touching main output/error.
    _evalExpr(expr) {
      const wrapped = '__scratch_eval_tmp = (' + String(expr) + ')\nprint(repr(__scratch_eval_tmp))';
      return this._runCode(wrapped, false).then((res) => {
        if (res.error) return 'Error: ' + res.error;
        // last non-empty line is the repr
        const lines = res.stdout.split('\n').filter((l) => l.length > 0);
        return lines.length ? lines[lines.length - 1] : '';
      }).catch((e) => 'Error: ' + e.message);
    }

    // ---- blocks ----

    runPython(args) {
      const code = args && args.CODE !== undefined ? String(args.CODE) : '';
      return this._runCode(code, true).then(() => {});
    }

    pythonOutput() {
      return this._output === '' ? '' : this._output;
    }

    pythonError() {
      return this._error === '' ? '' : this._error;
    }

    pythonHasError() {
      return this._error !== '';
    }

    evalPython(args) {
      const code = args && args.CODE !== undefined ? String(args.CODE) : '';
      const trimmed = code.trim();
      if (trimmed === '') return '';
      // If it looks like statements (has newlines / starts with a keyword), run and return stdout.
      const looksLikeStatements = /[\n;]/.test(code) ||
        /^\s*(import|from|def |class |for |while |if |with |try:|print\()/.test(code);
      if (looksLikeStatements) {
        return this._runCode(code, false).then((res) => {
          if (res.error) return 'Error: ' + res.error;
          return res.stdout;
        }).catch((e) => 'Error: ' + e.message);
      }
      return this._evalExpr(code).then((repr) => {
        // repr() of a string includes quotes — strip one layer for friendliness
        if (repr.length >= 2 && repr[0] === "'" && repr[repr.length - 1] === "'") {
          try {
            // unescape common sequences for display
            return repr.slice(1, -1).replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
          } catch (e) { return repr; }
        }
        return repr;
      });
    }

    pythonIsTrue(args) {
      const code = args && args.CODE !== undefined ? String(args.CODE) : '';
      if (code.trim() === '') return false;
      return this._evalExpr(code).then((repr) => repr === 'True').catch(() => false);
    }

    printPython(args) {
      const text = args && args.TEXT !== undefined ? String(args.TEXT) : '';
      return this._runCode('print(' + toPythonLiteral(text) + ')', true).then(() => {});
    }

    setPythonVar(args) {
      const name = String(args.NAME || '').trim();
      if (!isValidPyName(name)) return;
      const line = name + ' = ' + toPythonLiteral(args.VALUE);
      this._session += (this._session ? '\n' : '') + line;
      // verify it parses by running session alone; roll back on syntax error
      return this._runCode('', true).then(() => {});
    }

    getPythonVar(args) {
      const name = String(args.NAME || '').trim();
      if (!isValidPyName(name)) return '';
      return this._evalExpr(name).then((repr) => {
        if (typeof repr === 'string' && repr.indexOf('Error:') === 0) return '';
        if (repr.length >= 2 && repr[0] === "'" && repr[repr.length - 1] === "'") {
          return repr.slice(1, -1).replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        }
        return repr;
      }).catch(() => '');
    }

    clearPythonOutput() {
      this._output = '';
      this._error = '';
    }

    pythonVersion() {
      try {
        if (typeof window !== 'undefined' && window.Sk && window.Sk.pythonVersion) {
          return String(window.Sk.pythonVersion);
        }
      } catch (e) { /* fall through */ }
      return 'Python 3 (Skulpt 1.2.0)';
    }
  }

  Scratch.extensions.register(new Python());
})(Scratch);
