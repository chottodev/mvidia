const mongoose = require('mongoose');
const Video = require('./Video');

/**
 * @param {string} uri
 */
async function connect(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
}

module.exports = { connect, Video };
