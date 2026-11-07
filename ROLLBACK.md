# DYORCULT Tracker - Save Point & Rollback Instructions

## Current Working State
- **Date:** November 6, 2026
- **Version:** v1.0-working
- **Status:** ✅ Fully functional and deployed

## Live URLs
- Frontend: https://dyorcult.vercel.app
- Backend: https://dyorcult-backend.onrender.com
- GitHub: https://github.com/artdyor/DYORCULT

## Features Working
✅ Real-time Solana whale transaction feed
✅ Token detail pages with DexScreener/GeckoTerminal data
✅ TradingView-style embedded charts
✅ Beautiful AgentQL-inspired design
✅ Trading activity and liquidity analysis
✅ Social links and token information
✅ Full deployment on Vercel + Render

## How to Rollback to This Save Point

If anything breaks in the future, follow these steps to restore to this working state:

### Option 1: Using Git Tag (Recommended)

```powershell
# 1. Navigate to project directory
cd C:\MobyAgent\moby-whale-tracker

# 2. See all save points
git tag

# 3. Rollback to this save point
git checkout v1.0-working

# 4. Create a new branch from this state
git checkout -b restore-working-version

# 5. Push to GitHub (will trigger Vercel redeploy)
git push origin restore-working-version

# 6. In Vercel dashboard, change deployment branch to "restore-working-version"
```

### Option 2: Using Commit Hash

```powershell
# 1. Navigate to project directory
cd C:\MobyAgent\moby-whale-tracker

# 2. Find the commit hash
git log --oneline

# 3. Rollback to specific commit (use the hash from "Update API URL to use Render backend")
git checkout b9580af

# 4. Follow steps 4-6 from Option 1
```

### Option 3: Using GitHub

1. Go to https://github.com/artdyor/DYORCULT
2. Click "Releases" or "Tags"
3. Find "v1.0-working"
4. Download the source code
5. Extract and replace your local files
6. Push to GitHub

## Critical Files (DO NOT DELETE)

### Frontend
- `frontend/src/App.jsx` - Main whale feed
- `frontend/src/TokenDetail.jsx` - Token detail pages
- `frontend/src/App.css` - Main styling
- `frontend/src/TokenDetail.css` - Token detail styling

### Backend
- `backend/server.js` - API server with all endpoints

### Configuration
- `frontend/vite.config.js` - Vite build config
- `backend/package.json` - Backend dependencies
- `frontend/package.json` - Frontend dependencies

## Environment Variables

### Backend (Render)
- No environment variables required for basic functionality
- If you add AI narratives later, you'll need `ANTHROPIC_API_KEY`

### Frontend (Vercel)
- No environment variables required
- Backend URL is hardcoded in the code

## Deployment Details

### Vercel (Frontend)
- Framework: Vite
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Auto-deploys on push to `main` branch

### Render (Backend)
- Environment: Node
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `node server.js`
- Instance Type: Free (spins down after 15 min inactivity)

## Troubleshooting

### If frontend shows errors:
1. Check Vercel deployment logs
2. Verify backend is running at https://dyorcult-backend.onrender.com
3. Check browser console (F12) for errors

### If backend is down:
1. Visit https://dyorcult-backend.onrender.com to wake it up
2. Check Render logs for errors
3. Redeploy from Render dashboard if needed

### If data doesn't load:
1. Backend might be spinning up (wait 30-50 seconds on free tier)
2. DexScreener/GeckoTerminal APIs might be rate-limited
3. Check backend logs on Render

## Support

If you need help restoring or something goes wrong:
1. Check this document first
2. Review GitHub commit history
3. Compare files with the tagged version

## Last Known Good Configuration

**Frontend API URL:** `https://dyorcult-backend.onrender.com`

**Backend Port:** `3001`

**Git Commit:** `b9580af - Update API URL to use Render backend`

**Dependencies:**
- Node.js v24.19.0
- React 18.3.1
- Express 4.21.1
- Vite 8.3.6

---

**Created:** November 6, 2026
**Status:** ✅ Everything Working
**Save Point Tag:** v1.0-working
