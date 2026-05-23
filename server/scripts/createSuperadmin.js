const mongoose = require("mongoose");
const path = require("path");

const Superadmin = require("../Modules/superadmin/model");
const {
  hashSuperadminPassword,
  normalizeSuperadminEmail,
} = require("../Modules/superadmin/password.service");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });


async function run() {
  await mongoose.connect(process.env.DB_URI);

  const email = normalizeSuperadminEmail(
    process.env.SUPERADMIN_BOOTSTRAP_EMAIL || "superadmin@gmail.com",
  );
  const password = String(
    process.env.SUPERADMIN_BOOTSTRAP_PASSWORD || "AdminSecure@123",
  );

  const hash = await hashSuperadminPassword(password);

  await Superadmin.create({
    email,
    passwordHash: hash,
    role: "superadmin",
    status: "active",
  });

  console.log(`Superadmin created for ${email}`);
  process.exit(0);
}

run();
