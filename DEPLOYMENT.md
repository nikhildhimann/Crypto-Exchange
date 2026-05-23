# Deployment Notes

## GitHub Safety

Do not commit real `.env` files. Commit only `.env.example` files.

Before pushing:

```bash
git status --short
git check-ignore client/.env server/.env client/node_modules server/node_modules client/dist
```

## Vercel Client

- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables:

```env
VITE_API_BASE_URL=https://your-render-api.onrender.com/api
VITE_SOCKET_URL=https://your-render-api.onrender.com
```

## Render Server

- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Add environment variables from `server/.env.example` in Render dashboard.
- Use MongoDB Atlas for `DB_URI`.

For free-tier demo deployment, keep chain polling and payout workers off:

```env
JOBS_ENABLED=false
DEPOSIT_WATCHER_ENABLED=false
WITHDRAWAL_STATUS_ENABLED=false
TRANSACTION_STATUS_ENABLED=false
BALANCE_SYNC_ENABLED=false
TREASURY_RECONCILE_ENABLED=false
UTXO_WALLET_SYNC_ENABLED=false
SYNC_QUEUE_WORKER_ENABLED=false
CONVERSION_WORKER_ENABLED=false
CONVERSION_PAYOUT_EXECUTION_ENABLED=false
CONVERSION_PAYOUT_DRY_RUN=true
```

## Account Setup Speed

The app is configured to provision the selected primary wallet first. Extra chain hydration and history sync should stay deferred/background-only on free hosting.
