# Edunovas Deployment Workflow (Vercel + Cloudflare Tunnel)

This workflow describes how to deploy the **Edunovas** platform using Vercel for the Frontend and a Cloudflare Tunnel for the Backend (enabling secure access to your local or private server without opening ports).

## Prerequisites
- [Vercel CLI](https://vercel.com/docs/cli) installed (npm i -g vercel)
- [Cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) installed on your backend server
- A Cloudflare account with a domain added

## Step 1: Backend Deployment (Cloudflare Tunnel)

1. **Login to Cloudflared**:
   `cloudflared tunnel login`
2. **Create a Tunnel**:
   `cloudflared tunnel create edunovas-backend`
3. **Configure the Tunnel**:
   Create a `config.yml` in your Cloudfare directory (usually `~/.cloudflared/`):
   ```yaml
   url: http://localhost:8000
   tunnel: <TUNNEL_ID>
   credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

   ingress:
     - hostname: api.yourdomain.com
       service: http://localhost:8000
     - service: http_status:404
   ```
4. **Route DNS**:
   `cloudflared tunnel route dns edunovas-backend api.yourdomain.com`
5. **Run the Tunnel**:
   `cloudflared tunnel run edunovas-backend`

## Step 2: Frontend Deployment (Vercel)

1. **Configure Environment Variables**:
   In the Vercel Dashboard for your project, add the following Environment Variable:
   - `VITE_API_URL`: `https://api.yourdomain.com` (Your Cloudflare hostname)

2. **Deploy via CLI**:
   `vercel --prod`

## Step 3: Security & CORS
Ensure your backend's `main.py` has `CORSMiddleware` configured to allow your Vercel URL:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-app.vercel.app", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```
