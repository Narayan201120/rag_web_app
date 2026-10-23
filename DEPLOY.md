# Deployment

DocuMind has two halves. The frontend is a static Create React App build and fits Vercel. The backend runs Django with two local transformer models.

The backend is **not deployed**. It needs more memory than Render's free tier provides. The container and the configs below are ready for a host that fits.

## What the backend needs

Measured on the development machine, with the real index from `probe_retrieval.py`:

| Resource | Measured |
| --- | --- |
| RAM with both models loaded | 417 MB |
| Peak RAM while building an index | 730 MB |
| Index build, 64 chunks, 1 thread | 17.9 s |

Render free gives 512 MB RAM and 0.1 CPU. At 0.1 CPU the same build takes about 3 minutes. Render's $7 tier is still 512 MB. Do not deploy this backend to Render free.

| Host | Cost | RAM | Persistent storage |
| --- | --- | --- | --- |
| Oracle Cloud Always Free | $0 | 12 GB total | 200 GB block volume |
| Hugging Face Spaces | $9/mo (PRO) | 16 GB | Storage Bucket |
| Render Standard | $25/mo | 2 GB | $0.25/GB disk |

`backend/Dockerfile` works on all three.

## Frontend on Vercel

1. Log in. The installed CLI has a stale token.

   ```bash
   vercel login
   ```

2. Deploy from the frontend directory.

   ```bash
   cd frontend
   vercel --prod
   ```

   If you deploy from the dashboard instead, set **Root Directory** to `frontend`.

3. Set `REACT_APP_API_URL` in Project Settings → Environment Variables, then redeploy. CRA inlines this value at build time, so a later change needs a new build.

`frontend/vercel.json` rewrites deep links to `index.html`.

### How the browser reaches the API

**Proxy (recommended).** The browser calls the Vercel origin. Cookies stay first-party, and CORS is unnecessary.

- Set `REACT_APP_API_URL=/api`.
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

- Set `REACT_APP_API_URL=https://BACKEND_HOST/api`.
- Set `DJANGO_CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS` to `https://YOUR_APP.vercel.app`.
- Cookies are third-party. Safari blocks them, so `/api/token/refresh/` fails once the 30-minute access token expires. The proxy avoids this.

## Backend on Oracle Cloud Always Free

The free allowance is 2 OCPU and 12 GB RAM of Ampere A1, plus 200 GB of block storage. One VM is enough.

1. Create an Ubuntu 24.04 VM:
   - Shape: `VM.Standard.A1.Flex`
   - 1 OCPU, 4 GB RAM
   - 100 GB boot volume
   - Assign a public IPv4 address

2. Open ingress TCP 80 and 443 in the VCN security list for the subnet.

3. SSH in, then install Docker.

   ```bash
   sudo apt-get update
   sudo apt-get install -y docker.io docker-compose-v2 git
   sudo usermod -aG docker "$USER"
   ```

   Log out and back in so the group change applies.

4. Clone the repository and enter the stack directory.

   ```bash
   git clone https://github.com/Narayan201120/rag_web_app.git
   cd rag_web_app/deploy/oracle
   cp .env.example .env
   ```

5. Generate the three secrets.

   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(64))"
   python3 -c "import secrets; print(secrets.token_urlsafe(64))"
   python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
   ```

6. Fill `.env`.
   - `DJANGO_SECRET_KEY`, `JWT_SECRET_KEY`, `FIELD_ENCRYPTION_KEY`: the three values above.
   - `POSTGRES_PASSWORD`: any long random string.
   - `SITE_ADDRESS`: `YOUR_PUBLIC_IP.nip.io`, or your own domain.
   - `DJANGO_ALLOWED_HOSTS`: the same host, without a scheme.
   - `DJANGO_CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS`: `https://YOUR_APP.vercel.app`.

7. Start the stack.

   ```bash
   docker compose up -d --build
   ```

   The first build downloads torch and takes several minutes.

8. Check the API.

   ```bash
   curl https://YOUR_PUBLIC_IP.nip.io/api/health/
   docker compose logs -f backend
   ```

The stack runs Postgres, Redis, the backend, and Caddy. Caddy gets a Let's Encrypt certificate for `SITE_ADDRESS`. Uploaded documents, the model cache, the database, and the Redis data live in named volumes.

`nip.io` maps `140.82.1.2.nip.io` to `140.82.1.2` without a DNS record. Use a real domain if you have one. Ports 80 and 443 must be reachable from the internet for the certificate.

Oracle may reclaim an Always Free instance that stays below 20% CPU, network, and memory for seven days. The stack uses enough memory at 4 GB to stay above that line. See [Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

## Backend on Hugging Face Spaces

Docker Spaces need a PRO subscription.

1. Create a Docker Space.
2. Push the contents of `backend/` to the Space repository.
3. Add this front matter to the Space `README.md`:

   ```yaml
   ---
   title: DocuMind API
   emoji: 📚
   sdk: docker
   app_port: 8000
   ---
   ```

4. Add the secrets from the table below.
5. Set `RAG_DOCUMENTS_DIR=/data/documents` and `HF_HOME=/data/hf-cache`.
6. Mount a Storage Bucket at `/data` so uploads survive restarts.
7. Use a free Neon Postgres for `DATABASE_URL`. Neon Free is permanent, with 1 GB of storage.

## Backend on Render

`render.yaml` describes the service. Change the plan from `free` to `standard`, add a disk, and point `RAG_DOCUMENTS_DIR` at the disk mount. The free tier cannot run this backend.

## Environment variables

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
2. Sign up on the Vercel site.
3. Upload a text file.
4. Wait for the ingestion task to finish.
5. Ask a question and confirm the answer cites the file.
6. Reload the page and confirm the document is still listed.
7. Restart the backend container and confirm the document is still listed. This proves the volume is mounted.
