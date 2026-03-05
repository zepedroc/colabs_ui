# Deployment Guide (Vercel + Convex)

## One-time setup

### 1. Convex production deploy key

1. Go to [Convex Dashboard](https://dashboard.convex.dev/) → your project → **Settings**
2. Click **Generate Production Deploy Key**
3. Copy the key (you'll add it to Vercel)

### 2. Vercel project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `colabs_ui` repo from GitHub
3. Add environment variable:
   - **Name:** `CONVEX_DEPLOY_KEY`
   - **Value:** paste your Convex production deploy key
   - **Environment:** Production only
4. Build settings are already in `vercel.json` (Convex deploy + Vite build)

---

## Deploy workflow

### Create PR and merge

```bash
# 1. Authenticate with GitHub (one-time, if needed)
gh auth login

# 2. Create PR from dev to main
gh pr create --base main --head dev --title "Merge dev into main" --body "Production deployment"

# 3. After review, merge the PR
gh pr merge --merge
```

### What happens on merge

When you push/merge to `main`:

1. **Vercel** detects the push and runs a build
2. **Convex** deploys your backend to production (via `npx convex deploy`)
3. **Vite** builds the frontend with `VITE_CONVEX_URL` pointing to production
4. Your app is live at `https://<project>.vercel.app`

---

## Manual deploy (optional)

```bash
# Deploy Convex backend to production
npx convex deploy

# Or deploy everything via Vercel CLI
npx vercel --prod
```
