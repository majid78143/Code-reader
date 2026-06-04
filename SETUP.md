# MJ DEVLOPER Bot v2 — Setup Guide

  ## Requirements
  - Node.js 18 or 20 (NOT 14, NOT 16)
  - MongoDB Atlas (optional)
  - Firebase Realtime Database (optional)

  ## Installation
  ```
  npm install
  ```

  ## Configuration — Edit config.json
  | Field | Description |
  |---|---|
  | bot.token | Discord bot token |
  | bot.id | Bot application ID |
  | bot.ownerId | Your Discord user ID |
  | bot.admins | Array of admin user IDs |
  | database.mongodbUrl | MongoDB connection string (leave blank to disable) |
  | firebase.* | Firebase credentials (leave blank to disable) |
  | prefix.value | Command prefix (default: !) |

  ## Starting the Bot

  ```bash
  node src/index.js
  ```

  ## Hosting Panels (Pterodactyl / Wispbyte / NexCloud)
  - Startup command: `node ${MAIN_FILE}`
  - Variable: `MAIN_FILE = src/index.js`
  - Node.js version: 18 or 20

  ## PM2 (Production)
  ```bash
  npm install -g pm2
  pm2 start ecosystem.config.js
  pm2 save && pm2 startup
  ```

  ## Express API (Port 3000)
  | Endpoint | Method | Auth | Description |
  |---|---|---|---|
  | /health | GET | None | Health check |
  | /api/status | GET | None | Bot + server status |
  | /api/auth/login | POST | None | Start OTP login |
  | /api/auth/verify | POST | None | Verify OTP |
  | /api/auth/logout | POST | Session | Logout |
  | /api/request/submit | POST | None | Submit web request |
  | /api/request/status/:id | GET | None | Check request status |
  | /api/request/history/:id | GET | Session | User request history |
  | /api/admin/requests | GET | Admin | All requests |
  | /api/admin/request/:id/accept | POST | Admin | Accept request |
  | /api/admin/request/:id/reject | POST | Admin | Reject request |
  | /api/admin/stats | GET | Admin | Dashboard stats |
  