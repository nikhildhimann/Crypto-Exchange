require("dotenv").config();

const mongoose = require("mongoose");

const connectDB = require("../../config/database");
const Superadmin = require("../../Modules/superadmin/model");
const {
  hashSuperadminPassword,
  normalizeSuperadminEmail,
} = require("../../Modules/superadmin/password.service");

async function bootstrapSuperadmin() {
  const email = normalizeSuperadminEmail(process.env.SUPERADMIN_BOOTSTRAP_EMAIL);
  const password = String(process.env.SUPERADMIN_BOOTSTRAP_PASSWORD || "");
  const role = String(process.env.SUPERADMIN_BOOTSTRAP_ROLE || "superadmin").trim().toLowerCase();
  const shouldRotatePassword = /^true$/i.test(
    String(process.env.SUPERADMIN_BOOTSTRAP_ROTATE_PASSWORD || "false"),
  );

  if (!email) {
    throw new Error("SUPERADMIN_BOOTSTRAP_EMAIL is required");
  }

  if (!password) {
    throw new Error("SUPERADMIN_BOOTSTRAP_PASSWORD is required");
  }

  if (!["superadmin", "admin"].includes(role)) {
    throw new Error("SUPERADMIN_BOOTSTRAP_ROLE must be superadmin or admin");
  }

  await connectDB();

  const existing = await Superadmin.findOne({ email }).select("+passwordHash");
  const passwordHash = await hashSuperadminPassword(password);
  const now = new Date();

  if (!existing) {
    const created = await Superadmin.create({
      email,
      passwordHash,
      role,
      status: "active",
      mfaEnabled: false,
      lastLoginAt: null,
      lastPasswordChangedAt: now,
      metadata: {
        bootstrapCreatedAt: now.toISOString(),
      },
    });

    console.log(`Created superadmin ${created.email} (${created.role})`);
    return;
  }

  if (!shouldRotatePassword) {
    console.log(
      `Superadmin ${existing.email} already exists. Set SUPERADMIN_BOOTSTRAP_ROTATE_PASSWORD=true to rotate the password.`,
    );
    return;
  }

  existing.passwordHash = passwordHash;
  existing.role = role;
  existing.status = "active";
  existing.lastPasswordChangedAt = now;
  existing.metadata = {
    ...(existing.metadata || {}),
    bootstrapPasswordRotatedAt: now.toISOString(),
  };
  await existing.save();

  console.log(`Rotated password for superadmin ${existing.email} (${existing.role})`);
}

bootstrapSuperadmin()
  .catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => null);
  });
