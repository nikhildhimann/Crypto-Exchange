# 🪙 Crypto Wallet & Blockchain Exchange: Deployment & Showcase Manual

This project is a premium full-stack real-time crypto wallet and swap dashboard designed as a high-fidelity portfolio showcase. Follow this guide to deploy both client and server components to free-tier cloud platforms securely and reliably.

---

## ⚠️ Demo Mode & Safe Deployment Warning

> [!WARNING]
> This application is optimized to run in **Demo Mode** (`DEMO_MODE=true`) for showcases and interviews.
> - **Blockchain Syncing / Payout Workers**: All resource-intensive cron tasks, transaction monitoring, and automated swap/NFT history sync workers are **disabled** by default for demo safety.
> - **Mock Provider Integrity**: The frontend falls back to secure, isolated simulated mock adaptations when actual RPC endpoints are missing.
> - **CORS Isolation**: CORS is fully locked down in production to accept requests *only* from your deployed Vercel domain.

---

## 1. 📂 Exact Deployment Settings

To deploy this project to the free tier, use the exact settings outlined below on your hosting dashboards:

### 🖥️ Backend: Render
- **Service Type**: Web Service
- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Environment**: `Node`
- **Plan**: `Free`

### 🎨 Frontend: Vercel
- **Framework Preset**: `Vite` (or `Other`)
- **Root Directory**: `client`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install` (defaulted by Vercel)

---

## 2. 🗄️ Database Setup: MongoDB Atlas

1. **Create Account**: Sign up at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. **Provision Cluster**: Create a free **M0 Shared Cluster** in your preferred region.
3. **Database User**: Go to **Database Access**, create a user with `Read and write to any database` privileges, and select a secure password.
4. **Network Access**: Under **Network Access**, click **Add IP Address** and choose **Allow Access From Anywhere** (`0.0.0.0/0`).
5. **Get Connection String**:
   - Click **Connect** on your Database Cluster.
   - Choose **Connect your application (Drivers)**.
   - Copy the connection string (format: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/crypto-exchange?retryWrites=true&w=majority`).

---

## 3. 🛡️ Environment Variables Configuration

Copy these exact environment variables into the respective platform dashboards (do not upload actual secrets to public GitHub repositories).

### 🖥️ Render (Backend `server/.env`)
Provide these variables in the **Environment** tab of the Render Web Service:

```env
# Core Configuration
DEMO_MODE=true
NODE_ENV=production
PORT=6001
API_PREFIX=/api

# Allowed Frontend Origins (Use your actual Vercel domain)
CORS_ORIGIN=https://your-portfolio-exchange.vercel.app
SOCKET_ALLOWED_ORIGINS=https://your-portfolio-exchange.vercel.app
SOCKET_ALLOW_CREDENTIALS=true

# MongoDB Database String
DB_URI=mongodb+srv://<username>:<password>@cluster.xxxx.mongodb.net/crypto-exchange?retryWrites=true&w=majority

# JWT Authentication (Use 64-character random keys)
JWT_SECRET=generate_a_secure_64_character_hex_string_user_key
SUPERADMIN_JWT_SECRET=generate_a_different_secure_64_character_hex_string_admin_key
ENCRYPTION_KEY=generate_a_secure_64_character_hex_string_encryption_key
JWT_EXPIRES_IN=1d
ACCESS_TOKEN_EXPIRES_IN=15m

# Background Services (Optimized for Free Tier)
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
```

### 🎨 Vercel (Frontend `client/.env`)
Configure these environment variables in the Vercel **Project Settings > Environment Variables** pane:

```env
# URL of your live Render Backend API (no trailing slash)
VITE_API_BASE_URL=https://crypto-wallet-api.onrender.com/api
VITE_SOCKET_URL=https://crypto-wallet-api.onrender.com

# Demo UI Limits
VITE_BALANCE_REFRESH_INTERVAL_MS=60000
VITE_NOTIFICATION_REFRESH_INTERVAL_MS=60000
VITE_MARKET_PRICE_REFRESH_INTERVAL_MS=180000
VITE_NFT_SYNC_STATUS_POLL_INTERVAL_MS=15000
VITE_PENDING_SWAP_REFRESH_INTERVAL_MS=30000
VITE_SWAP_STATUS_POLL_INTERVAL_MS=30000
VITE_CONVERSION_PREVIEW_DEBOUNCE_MS=600
VITE_CONVERSION_POLL_INTERVAL_MS=30000
```

---

## 4. 🚀 Step-by-Step GitHub Push & Staging

Run the following commands locally to prepare your codebase and push it to a private or public GitHub repository.

```bash
# 1. Check git status to make sure local environment files (.env) are ignored
git status --short

# 2. Add all tracked project code securely
git add .

# 3. Create a clean commit
git commit -m "chore: optimize full-stack configuration for secure free demo deployment"

# 4. Add your GitHub remote (if setting up for the first time)
# git remote add origin https://github.com/your-username/your-repo-name.git

# 5. Push code safely to main branch
git push -u origin main
```

---

## 5. 🏁 Pre-Interview Demo Checklist

Before showcasing the live exchange to an interviewer, run through this checklist to guarantee a smooth demo:

- [ ] **Warm-up Render Instance**: Render free tier instances spin down after 15 minutes of inactivity. **Always** visit the live frontend domain or ping `/health` on the backend URL 2-3 minutes before the interview to trigger the warm-up cycle.
- [ ] **Database Connection Health**: Open the MongoDB Atlas dashboard to confirm the M0 cluster is online and active.
- [ ] **CORS Restriction Check**: Inspect the console log in the browser. Verify that there are no CORS connection errors or unauthorized domain blocks.
- [ ] **Tab Sleep Behavior**: Confirm that background updates halt when the tab is hidden and resume cleanly upon focus without layout thrashing.
- [ ] **Responsive Design Test**: Drag your browser window size down to mobile to verify fluid touch controls and responsive dashboard layouts.
- [ ] **Isolated Local Environment**: Ensure no hardcoded `localhost` links remain inside the production builds.
