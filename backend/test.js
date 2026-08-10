"use strict";

if (require.main !== module) {
  module.exports = {};
} else {
  const { MongoClient } = require('mongodb');
  require('dotenv').config();
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is not defined');
    process.exit(1);
  }

  const client = new MongoClient(uri);

  const run = async () => {
    try {
      await client.connect();
      console.log('CONNECTED SUCCESSFULLY');
    } catch (err) {
      console.error(err);
    } finally {
      await client.close();
    }
  };

  run();
}
