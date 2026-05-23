import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveExplicitProvisioningTarget,
  resolveProvisioningTarget,
} from "../src/lib/walletProvisioning.js";

test("generic provisioning target skips Hedera when autoProvision is disabled", () => {
  const supportedChains = [
    {
      code: "hbar",
      defaultNetwork: "mainnet",
      supportedNetworks: [{ code: "mainnet", label: "Mainnet" }],
      provisioning: {
        autoProvision: false,
        networks: ["mainnet"],
      },
    },
    {
      code: "eth",
      defaultNetwork: "mainnet",
      supportedNetworks: [{ code: "mainnet", label: "Mainnet" }],
      provisioning: {
        autoProvision: true,
        networks: ["mainnet"],
      },
    },
  ];

  assert.deepEqual(resolveProvisioningTarget(supportedChains, "mainnet"), {
    chain: "eth",
    network: "mainnet",
  });
});

test("explicit provisioning target resolves Hedera even when it is on-demand only", () => {
  const supportedChains = [
    {
      code: "hbar",
      defaultNetwork: "mainnet",
      supportedNetworks: [
        { code: "mainnet", label: "Mainnet" },
        { code: "testnet", label: "Testnet" },
      ],
      provisioning: {
        autoProvision: false,
        networks: ["mainnet", "testnet"],
      },
    },
  ];

  assert.deepEqual(
    resolveExplicitProvisioningTarget(supportedChains, "hbar", "testnet"),
    {
      chain: "hbar",
      network: "testnet",
    },
  );
});
