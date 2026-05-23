const mongoose = require("mongoose");

const { requireEnv } = require("./utils");

async function run() {
  const dbUri = requireEnv("DB_URI");
  const transactionId = requireEnv("MANUAL_TRANSACTION_ID");

  await mongoose.connect(dbUri);
  const tx = await mongoose.connection.db
    .collection("transactions")
    .findOne({ _id: new mongoose.Types.ObjectId(transactionId) });
  console.log(JSON.stringify(tx, null, 2));
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
