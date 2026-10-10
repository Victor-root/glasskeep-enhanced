// server/utils/ids.js
//
// Identifiers for the rows the server creates itself.

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

module.exports = { uid };
