# Deployment

DocuMind has two halves. The frontend is a static Vite build. The backend is Django with two local transformer models.

**Live frontend:** https://documind-sooty-two.vercel.app

The backend is **not deployed**. It needs about 730 MB of RAM at peak and a persistent disk.

## What the backend needs

Measured on the development machine, with the real index from `probe_retrieval.py`:

| Resource | Measured |
| --- | --- |
| RAM with both models loaded | 417 MB |
| Peak RAM while building an index | 730 MB |
| Installed `site-packages` | 1.29 GB |
| `torch` alone | 443 MB |
| Index build, 64 chunks, 1 thread | 17.9 s |

Render free gives 512 MB RAM and 0.1 CPU. At 0.1 CPU the same build takes about 3 minutes. Render's $7 tier is still 512 MB.

| Host | Cost | RAM | Persistent storage | Docker |
| --- | --- | --- | --- | --- |
| Oracle Cloud Always Free | $0 | 12 GB total | 200 GB block volume | no |
| Render Standard | $25/mo | 2 GB | $0.25/GB disk | no |
| Hugging Face Spaces | $9/mo (PRO) | 16 GB | Storage Bucket | yes |

## Why not Vercel Functions

The Hobby plan does give each function 2 GB of RAM and 300 seconds. Memory is not the blocker. These are:

- The standard Python bundle limit is **500 MB uncompressed**. The measured `site-packages` is **1.29 GB**. The Large Functions beta raises the limit to 5 GB, so the bundle could fit.
- The request body limit is **4.5 MB**, which blocks document uploads.
- Functions have a read-only filesystem except an ephemeral `/tmp`. Uploads and built indexes do not survive between invocations.
- Ingestion runs in background threads that die when the response ends. Per-user indexes live in memory.
- A cold start loads both models before the first request is served.

Running here needs a rewrite around external storage, a queue, and a vector store, not a deployment of the current code.

## Frontend on Vercel

Live at https://documind-sooty-two.vercel.app. The project is `narayan201120s-projects/documind`, linked from `frontend/.vercel`.

The project is **not connected to GitHub**. A push does not deploy. Run the CLI from `frontend/`:

```bash
cd frontend
vercel --prod
```

`frontend/vercel.json` sets the framework, the build command, and the output directory, then rewrites deep links to `index.html`:

```json
{
  "framework": "vite",
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

`npm run build` runs `tsc --noEmit` before Vite, so a type error fails the deploy. TypeScript is pinned to `7.1.0-beta`, and `package-lock.json` already lists the Linux x64 binary that Vercel installs. Vite writes `dist/`. Vercel builds with Node 24.

Vite inlines `VITE_*` variables at build time. Change one and redeploy; nothing updates at runtime.

| Variable | Status | Notes |
| --- | --- | --- |
| `VITE_API_URL` | not set | Falls back to `http://127.0.0.1:8000/api`. Set it once a backend exists. |
| `VITE_GOOGLE_CLIENT_ID` | not set | The Google button stays hidden while this is empty. |
| `VITE_MICROSOFT_CLIENT_ID` | not set | Same. |
| `VITE_GITHUB_CLIENT_ID` | not set | Same. |
| `VITE_MOCK` | not set | `1` builds the UI against fixtures with no backend. Do not set this in production. |

Set them with the CLI, piping the value through stdin:

```powershell
cd frontend
'https://api.example.com/api' | vercel env add VITE_API_URL production --no-sensitive --yes
```

```bash
cd frontend
printf '%s' 'https://api.example.com/api' | vercel env add VITE_API_URL production --no-sensitive --yes
```

Verified after the Vite deploy on 2026-10-24:

| Check | Result |
| --- | --- |
| `/` | 200, serves the Vite `index.html` |
| `/login` | 200, renders the sign-in form |
| `/documents`, `/chat` | 200, serve `index.html` |
| `/does-not-exist` | 200, serves `index.html` |
| `/assets/index-C90jblD0.js` | 200, 498 KB, same hash as the local build |

The only console error is `ERR_CONNECTION_REFUSED` from `http://127.0.0.1:8000/api/token/refresh/`. `VITE_API_URL` is unset, so the browser tries localhost.

The old Create React App frontend lives on the `frontend-legacy` branch. It is not deployed.

### How the browser reaches the API

**Proxy (recommended).** The browser calls the Vercel origin. Cookies stay first-party, and CORS is unnecessary.

- Set `VITE_API_URL=/api`.
- Put the API rewrite before the SPA rule in `frontend/vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://BACKEND_HOST/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Direct.** The browser calls the backend origin.

- Set `VITE_API_URL=https://BACKEND_HOST/api`.
- Set `DJANGO_CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS` to `https://YOUR_APP.vercel.app`.
- Cookies are third-party. Safari blocks them, so `/api/token/refresh/` fails once the 30-minute access token expires. The proxy avoids this.

## Backend on Oracle Cloud Always Free

The free allowance is 2 OCPU and 12 GB RAM of Ampere A1, plus 200 GB of block storage. One VM is enough. Everything runs natively. No Docker.

1. Create an Ubuntu 24.04 VM:
   - Shape: `VM.Standard.A1.Flex`
   - 1 OCPU, 4 GB RAM
   - 100 GB boot volume
   - Assign a public IPv4 address

2. Open ingress TCP 80 and 443 in the VCN security list for the subnet.

3. SSH in, install Git, and clone the repository.

   ```bash
   sudo apt-get update
   sudo apt-get install -y git
   git clone https://github.com/Narayan201120/rag_web_app.git
   cd rag_web_app
   ```

4. Run the installer.

   ```bash
   sudo SITE_ADDRESS=YOUR_PUBLIC_IP.nip.io \
        CORS_ORIGIN=https://documind-sooty-two.vercel.app \
        bash deploy/oracle/setup.sh
   ```

   The script:
   - installs Python, Postgres, Redis, Caddy, and `libgomp1`
   - creates the `documind` system user and `/opt/documind`
   - copies `backend/` and builds a virtual environment
   - generates secrets once into `/etc/documind/documind.env`
   - creates the Postgres role and database
   - runs migrations, `collectstatic`, and downloads both models
   - writes `/etc/systemd/system/documind.service`
   - writes the Caddyfile and gets a certificate for `SITE_ADDRESS`
   - opens ports 80 and 443 in `ufw`
   - starts the service and waits for `/api/health/`

   Re-running is safe. It keeps the env file, the database, and uploaded documents. Run it again after `git pull` to update the code.

5. Check the API.

   ```bash
   curl https://YOUR_PUBLIC_IP.nip.io/api/health/
   journalctl -u documind -f
   ```

The service runs gunicorn with one worker and four threads. That matches the measured memory: each extra worker loads another copy of the models.

ARM64 wheels were verified for `faiss-cpu`, `torch`, `psycopg`, `numpy`, and `tokenizers`, so the A1 shape installs cleanly.

`nip.io` maps `140.82.1.2.nip.io` to `140.82.1.2` without a DNS record. Use a real domain if you have one. Ports 80 and 443 must be reachable from the internet for the certificate.

Oracle may reclaim an Always Free instance that stays below 20% CPU, network, and memory for seven days. At 4 GB with the models loaded, memory use stays above that line. See [Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

## Backend on Render

`render.yaml` describes the service. Change the plan from `free` to `standard`, add a disk, and point `RAG_DOCUMENTS_DIR` at the disk mount. Render runs Python natively, so no Docker is needed. The free tier cannot run this backend.

## Backend on Hugging Face Spaces

Free accounts get Static Spaces only. A custom Django server needs a Docker Space, and Docker Spaces need PRO. Not used here.

## Environment variables

`deploy/oracle/setup.sh` writes these to `/etc/documind/documind.env`.

| Variable | Required | Value |
| --- | --- | --- |
| `DJANGO_DEBUG` | yes | `false` |
| `DJANGO_SECRET_KEY` | yes | Random string, at least 50 characters |
| `JWT_SECRET_KEY` | yes | Random string, at least 50 characters |
| `FIELD_ENCRYPTION_KEY` | yes | URL-safe base64 of 32 random bytes |
| `DATABASE_URL` | yes | Postgres connection string |
| `DJANGO_ALLOWED_HOSTS` | yes | Public backend host, no scheme |
| `DJANGO_CORS_ALLOWED_ORIGINS` | yes | `https://YOUR_APP.vercel.app` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | yes | Same as CORS |
| `RAG_DOCUMENTS_DIR` | no | Persistent path for uploads |
| `HF_HOME` | no | Persistent path for model weights |
| `RAG_INDEX_CACHE_USERS` | no | Defaults to 2. Raise only with memory to spare. |

Startup fails with `ImproperlyConfigured` if a required variable is missing.

## Verify a deployment

1. `GET /api/health/` returns 200.
2. Open the Vercel site and sign up.
3. Upload a text file.
4. Wait for the ingestion task to finish.
5. Ask a question and confirm the answer cites the file.
6. Reload the page and confirm the document is still listed.
7. Restart the service with `sudo systemctl restart documind` and confirm the document is still listed. This proves the upload directory survives.
