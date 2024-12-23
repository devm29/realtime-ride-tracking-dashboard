// Quiet under NODE_ENV=test so the test output stays readable.
const silent = process.env.NODE_ENV === 'test';

module.exports = {
  info: (...args) => { if (!silent) console.log(...args); },
  warn: (...args) => { if (!silent) console.warn(...args); },
  error: (...args) => { if (!silent) console.error(...args); }
};
