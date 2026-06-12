const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log("CONNECTED SUCCESSFULLY");
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

run();
