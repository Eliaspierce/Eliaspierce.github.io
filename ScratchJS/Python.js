// Python.js — Scratch / TurboWarp extension
// Name: Python | Id: Python | Color: Blue
// Load in TurboWarp: "Load custom extension" -> upload Python.js or paste its URL.
// Runs real Python (Skulpt) inside Scratch blocks.
// Errors and warnings carry line numbers: see "python error line" and "python warnings".
//   print("hi")                  -> python output
//   print(x + oops)              -> python error = "Line 3: NameError: ..." (user's line, not shifted)
//   warnings.warn("careful")     -> python warnings = "Line 2: Warning: careful"
//   warn("hey")                  -> same (bare warn() also works, no import needed)

(function (Scratch) {
  'use strict';

  if (!Scratch || !Scratch.extensions || typeof Scratch.extensions.register !== 'function') {
    throw new Error('Python extension must be run in Scratch / TurboWarp.');
  }

  const BLOCK_ICON_URI = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/3840px-Python-logo-notext.svg.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=thumbnail';

  const SKULPT_URL = 'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js';
  const SKULPT_STDLIB_URL = 'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js';

  // Python prelude injected before every run. Defines warn()/warnings shim
  // (Skulpt has no `warnings` module) and forwards warnings to JS with line numbers.
  const WARNING_PRELUDE = [
    "__scratch_warning_list = []",
    "try:",
    "    Warning",
    "except NameError:",
    "    class Warning(Exception):",
    "        pass",
    "try:",
    "    UserWarning",
    "except NameError:",
    "    class UserWarning(Warning):",
    "        pass",
    "try:",
    "    DeprecationWarning",
    "except NameError:",
    "    class DeprecationWarning(Warning):",
    "        pass",
    "try:",
    "    FutureWarning",
    "except NameError:",
    "    class FutureWarning(Warning):",
    "        pass",
    "try:",
    "    SyntaxWarning",
    "except NameError:",
    "    class SyntaxWarning(Warning):",
    "        pass",
    "def __scratch_warn(__msg, __cat='Warning', __scratch_line=-1, **__kw):",
    "    try:",
    "        __cn = __cat.__name__",
    "    except Exception:",
    "        __cn = str(__cat)",
    "    __txt = str(__cn) + ': ' + str(__msg)",
    "    __scratch_warning_list.append((__scratch_line, __txt))",
    "    try:",
    "        __scratch_warn_js(__scratch_line, __txt)",
    "    except Exception:",
    "        pass",
    "class __ScratchWarningsShim:",
    "    def warn(self, __msg, __cat='Warning', **__kw):",
    "        return __scratch_warn(__msg, __cat, **__kw)",
    "    def simplefilter(self, *__a, **__k):",
    "        pass",
    "    def filterwarnings(self, *__a, **__k):",
    "        pass",
    "warnings = __ScratchWarningsShim()",
    "def warn(__msg, __cat='Warning', **__kw):",
    "    return __scratch_warn(__msg, __cat, **__kw)"
  ].join('\n');
  const PRELUDE_LINES = WARNING_PRELUDE.split('\n').length;

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

  function formatWarning(w) {
    return (w && w.line > 0 ? 'Line ' + w.line + ': ' : '') + (w ? w.text : '');
  }

  // Skulpt has no `warnings` module, so `import warnings` would crash.
  // Neutralize such imports (keeping the line, so line numbers don't shift).
  function sanitizeWarningsImports(line) {
    if (/^\s*from\s+warnings\s+import\b/.test(line)) return 'pass';
    const m = line.match(/^(\s*import\s+)([^#]+?)\s*(#.*)?$/);
    if (m && /(^|,)\s*warnings(\s+as\s+\w+)?\s*($|,)/.test(m[2])) {
      const alias = m[2].trim().match(/^warnings\s+as\s+(\w+)$/);
      if (alias) return alias[1] + ' = warnings';
      const rest = m[2].split(',').map(s => s.trim()).filter(s => s && !/^warnings(\s+as\s+\w+)?$/.test(s));
      if (rest.length === 0) return 'pass';
      return m[1] + rest.join(', ') + (m[3] ? ' ' + m[3] : '');
    }
    return line;
  }

  // Mask strings/comments with spaces (length preserved) so the call scan below
  // never matches inside "warn(" text or # warn( comments.
  function maskPython(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === '#') {
        while (i < n && src[i] !== '\n') { out += ' '; i++; }
        continue;
      }
      if (c === "'" || c === '"') {
        const triple = src[i + 1] === c && src[i + 2] === c;
        const q = triple ? c + c + c : c;
        const qlen = triple ? 3 : 1;
        for (let k = 0; k < qlen; k++) { out += ' '; i++; }
        while (i < n) {
          if (!triple && src[i] === '\n') break;
          if (src[i] === '\\' && i + 1 < n) { out += '  '; i += 2; continue; }
          if (src.substr(i, qlen) === q) { for (let k = 0; k < qlen; k++) { out += ' '; i++; } break; }
          out += (src[i] === '\n' ? '\n' : ' ');
          i++;
        }
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  // Rewrite warn(...) / warnings.warn(...) calls to carry their line number:
  //   warnings.warn("m")            -> __scratch_warn("m", __scratch_line=2)
  //   warnings.warn("m", DepWarn)   -> __scratch_warn("m", DepWarn, __scratch_line=2)
  // Handles nested parens and multiline calls; line count never changes.
  function injectWarnLines(code) {
    const src = String(code);
    if (src.indexOf('warn') === -1) return src;
    const masked = maskPython(src);
    const re = /(warnings\s*\.\s*warn|warn)\s*\(/g;
    const edits = [];
    let m;
    while ((m = re.exec(masked)) !== null) {
      const start = m.index;
      const prev = start > 0 ? masked[start - 1] : '';
      if (/[A-Za-z0-9_.]/.test(prev)) continue; // obj.warn, my_warn, __scratch_warn
      const lineStart = masked.lastIndexOf('\n', start - 1) + 1;
      if (/\bdef\s+$/.test(masked.slice(lineStart, start))) continue; // `def warn(` definition
      const openParen = start + m[0].length - 1;
      let depth = 0;
      let close = -1;
      for (let j = openParen; j < masked.length; j++) {
        if (masked[j] === '(') depth++;
        else if (masked[j] === ')') {
          depth--;
          if (depth === 0) { close = j; break; }
        }
      }
      if (close === -1) continue;
      const inner = masked.slice(openParen + 1, close);
      if (inner.indexOf('__scratch_line') !== -1) continue;
      const lineNo = masked.slice(0, start).split('\n').length;
      // NOTE: check the ORIGINAL text for emptiness — masked has strings blanked out
      const innerOrig = src.slice(openParen + 1, close);
      edits.push({
        open: openParen,
        close,
        text: (/^\s*$/.test(innerOrig) ? '__scratch_line=' + lineNo : ', __scratch_line=' + lineNo)
      });
    }
    if (!edits.length) return src;
    edits.sort((a, b) => b.close - a.close);
    let out = src;
    for (const e of edits) out = out.slice(0, e.close) + e.text + out.slice(e.close);
    // rename the callee warnings.warn( / warn( -> __scratch_warn( (back to front)
    const calleeEdits = [];
    const re2 = /(warnings\s*\.\s*warn|warn)\s*\(/g;
    const masked2 = maskPython(out);
    let m2;
    while ((m2 = re2.exec(masked2)) !== null) {
      const start = m2.index;
      const prev = start > 0 ? masked2[start - 1] : '';
      if (/[A-Za-z0-9_.]/.test(prev)) continue;
      const lineStart = masked2.lastIndexOf('\n', start - 1) + 1;
      if (/\bdef\s+$/.test(masked2.slice(lineStart, start))) continue;
      // only rename calls we injected into (they contain __scratch_line)
      const openParen = start + m2[0].length - 1;
      let depth = 0;
      let close = -1;
      for (let j = openParen; j < masked2.length; j++) {
        if (masked2[j] === '(') depth++;
        else if (masked2[j] === ')') { depth--; if (depth === 0) { close = j; break; } }
      }
      if (close === -1) continue;
      if (masked2.slice(openParen, close).indexOf('__scratch_line') === -1) continue;
      calleeEdits.push({ start, end: openParen, name: '__scratch_warn(' });
    }
    calleeEdits.sort((a, b) => b.start - a.start);
    for (const e of calleeEdits) out = out.slice(0, e.start) + e.name + out.slice(e.end + 1);
    return out;
  }

  // Pull type + user-facing line number out of a Skulpt error.
  // lineOffset = prelude + session lines sitting above the user's code.
  function extractSkError(err, lineOffset) {
    let type = 'Error';
    let msg = '';
    let fullLine = 0;
    try {
      if (err && typeof err === 'object') {
        if (typeof err.tp$name === 'string' && err.tp$name) type = err.tp$name;
        try {
          if (err.tp$str) {
            const s = err.tp$str();
            if (s && s.v !== undefined && s.v !== null) msg = String(s.v);
          }
        } catch (e) { /* ignore */ }
        if (!msg && err.args && err.args.v && err.args.v.length) {
          try {
            msg = err.args.v.map(a => ((a && a.v !== undefined) ? String(a.v) : String(a))).join(': ');
          } catch (e) { /* ignore */ }
        }
        const tb = err.traceback;
        if (tb && tb.length) {
          for (let k = tb.length - 1; k >= 0; k--) {
            const fr = tb[k];
            if (fr && typeof fr.lineno === 'number' && (!fr.filename || String(fr.filename).indexOf('<stdin>') !== -1)) {
              fullLine = fr.lineno;
              break;
            }
          }
          if (!fullLine) {
            for (let k = tb.length - 1; k >= 0; k--) {
              if (tb[k] && typeof tb[k].lineno === 'number') { fullLine = tb[k].lineno; break; }
            }
          }
        } else if (typeof err.lineno === 'number') {
          fullLine = err.lineno;
        }
      }
    } catch (e) { /* ignore */ }
    if (!msg) {
      try { msg = (err && err.toString) ? String(err.toString()) : String(err); }
      catch (e) { msg = 'Unknown error'; }
    }
    let userLine = fullLine > 0 ? fullLine - lineOffset : 0;
    if (!(userLine >= 1)) userLine = 0;
    if (userLine > 0) msg = msg.replace(/on line \d+/, 'on line ' + userLine);
    const text = userLine > 0 ? ('Line ' + userLine + ': ' + type + ': ' + msg) : (type + ': ' + msg);
    return { type, line: userLine, text };
  }

  class Python {
    constructor() {
      this._session = '';   // persistent python definitions from "set variable" blocks
      this._output = '';    // stdout of last "run python" block
      this._error = '';     // "Line N: Type: message" ('' = no error)
      this._errorLine = 0;  // user code line of last error (0 = none / unknown)
      this._errorType = ''; // e.g. "NameError", "SyntaxError" ('' = none)
      this._warnings = [];  // [{line, text}] from warn() / warnings.warn()
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
            opcode: 'pythonErrorLine',
            blockType: Scratch.BlockType.REPORTER,
            text: 'python error line'
          },
          {
            opcode: 'pythonErrorType',
            blockType: Scratch.BlockType.REPORTER,
            text: 'python error type'
          },
          {
            opcode: 'pythonHasError',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'python has error?'
          },
          {
            opcode: 'pythonWarnings',
            blockType: Scratch.BlockType.REPORTER,
            text: 'python warnings'
          },
          {
            opcode: 'pythonWarningCount',
            blockType: Scratch.BlockType.REPORTER,
            text: 'python warning count'
          },
          {
            opcode: 'pythonHasWarning',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'python has warning?'
          },
          {
            opcode: 'warnPython',
            blockType: Scratch.BlockType.COMMAND,
            text: 'python warn [TEXT]',
            arguments: {
              TEXT: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'be careful!'
              }
            }
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
      capture.warnings = [];
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
      // JS hook so warnings survive even when the code later raises.
      try {
        Sk.builtins['__scratch_warn_js'] = new Sk.builtin.func(function (line, text) {
          try {
            let ln = 0;
            let tx = '';
            try { ln = Number(Sk.ffi.remapToJs(line)) || 0; } catch (e) { ln = 0; }
            try { tx = String(Sk.ffi.remapToJs(text)); } catch (e) { tx = ''; }
            capture.warnings.push({ line: ln, text: tx });
          } catch (e) { /* ignore */ }
          return Sk.builtin.none.none$;
        });
      } catch (e) { /* older Skulpt: warnings still land in __scratch_warning_list */ }
    }

    // Build the code Skulpt actually runs + the line offset of the user's code within it.
    _prepareCode(code) {
      const raw = String(code);
      const sanitized = raw.split('\n').map(sanitizeWarningsImports).join('\n');
      const transformed = injectWarnLines(sanitized);
      const parts = [WARNING_PRELUDE];
      if (this._session) parts.push(this._session);
      parts.push(transformed);
      const fullCode = parts.join('\n');
      const lineOffset = PRELUDE_LINES + (this._session ? this._session.split('\n').length : 0);
      return { fullCode, lineOffset };
    }

    _storeResult(keepMainState, data) {
      if (keepMainState) {
        this._output = data.stdout;
        this._error = data.error;
        this._errorLine = data.errorLine;
        this._errorType = data.errorType;
        this._warnings = data.warnings;
      }
    }

    // Run code (plus prelude + persistent session). Returns
    // { stdout, error, errorLine, errorType, warnings }.
    _runCode(code, keepMainState) {
      return this._ensureSkulpt().then(() => {
        const Sk = window.Sk;
        const capture = { stdout: '', warnings: [] };
        this._configureSk(capture);
        const prep = this._prepareCode(code);
        return Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('<stdin>', false, prep.fullCode, true))
          .then(() => {
            const data = {
              stdout: capture.stdout,
              error: '',
              errorLine: 0,
              errorType: '',
              warnings: capture.warnings.slice()
            };
            this._storeResult(keepMainState, data);
            return data;
          })
          .catch((err) => {
            const info = extractSkError(err, prep.lineOffset);
            const data = {
              stdout: capture.stdout,
              error: info.text,
              errorLine: info.line,
              errorType: info.type,
              warnings: capture.warnings.slice()
            };
            this._storeResult(keepMainState, data);
            return data;
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

    pythonErrorLine() {
      return this._errorLine;
    }

    pythonErrorType() {
      return this._errorType === '' ? '' : this._errorType;
    }

    pythonHasError() {
      return this._error !== '';
    }

    pythonWarnings() {
      return this._warnings.map(formatWarning).join('\n');
    }

    pythonWarningCount() {
      return this._warnings.length;
    }

    pythonHasWarning() {
      return this._warnings.length > 0;
    }

    warnPython(args) {
      const text = args && args.TEXT !== undefined ? String(args.TEXT) : '';
      this._warnings.push({ line: 0, text: 'Warning: ' + text });
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
      // verify it parses by running session alone
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
      this._errorLine = 0;
      this._errorType = '';
      this._warnings = [];
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
