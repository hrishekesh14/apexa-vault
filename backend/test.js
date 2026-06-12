const { MongoClient } = require("mongodb");

const uri =
"mongodb+srv://HrishekeshVarma:ApexaVault123@cluster0.0ppu4d2.mongodb.net/?retryWrites=true&w=majority";

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