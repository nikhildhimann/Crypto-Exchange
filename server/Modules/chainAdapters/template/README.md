# Chain Adapter Template

Use this folder as the starter when adding a new chain adapter.

Steps:
1. Add the chain metadata to `server/config/chains.js`.
2. Copy this `template` folder to `server/Modules/chainAdapters/<chain-code>`.
3. Update `amount.js` with the chain's native asset decimals.
4. Replace placeholder implementations with real chain logic.
5. Export the adapter through `server/Modules/chainAdapters/<chain-code>/index.js`.
6. Register the adapter in `server/Modules/chainAdapters/manifest.js`.

Required adapter sections are enforced at startup by `server/Modules/chainAdapters/contract.js`.
