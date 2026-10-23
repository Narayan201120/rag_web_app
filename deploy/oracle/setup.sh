#!/usr/bin/env bash
# Install DocuMind on a fresh Ubuntu 24.04 VM. No Docker.
#
# From the repository root:
#   sudo SITE_ADDRESS=203.0.113.10.nip.io \
#        CORS_ORIGIN=https://documind.vercel.app \
#        bash deploy/oracle/setup.sh
#
# Re-running is safe. It keeps the generated secrets, the database, and the
# uploaded documents.

set -euo pipefail

SITE_ADDRESS="${SITE_ADDRESS:?set SITE_ADDRESS, for example 203.0.113.10.nip.io}"
CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:3000}"

APP_USER="documind"
APP_DIR="/opt/documind"
DATA_DIR="/var/lib/documind"
ENV_DIR="/etc/documind"
ENV_FILE="$ENV_DIR/documind.env"
DB_NAME="documind"
DB_USER="documind"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="$APP_DIR/venv/bin/python"

if [ "$(id -u)" -ne 0 ]; then
    echo "run this with sudo" >&2
    exit 1
fi

echo "== packages =="
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3-venv python3-pip postgresql redis-server caddy libgomp1 git ufw curl

echo "== user and directories =="
if ! id -u "$APP_USER" >/dev/null 2>&1; then
    useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR" "$DATA_DIR" "$DATA_DIR/documents" "$DATA_DIR/hf-cache"
install -d -m 0750 "$ENV_DIR"

echo "== application files =="
rm -rf "$APP_DIR/backend"
cp -a "$REPO_DIR/backend" "$APP_DIR/backend"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/backend"

echo "== python environment =="
if [ ! -x "$PY" ]; then
    sudo -u "$APP_USER" python3 -m venv "$APP_DIR/venv"
fi
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install --quiet --upgrade pip
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install --quiet -r "$APP_DIR/backend/requirements.txt"

echo "== secrets =="
if [ ! -f "$ENV_FILE" ]; then
    DB_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
    DJANGO_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"
    JWT_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"
    FIELD_ENCRYPTION_KEY="$(python3 -c 'import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())')"
    cat > "$ENV_FILE" <<EOF
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=$DJANGO_SECRET_KEY
JWT_SECRET_KEY=$JWT_SECRET_KEY
FIELD_ENCRYPTION_KEY=$FIELD_ENCRYPTION_KEY
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME
DJANGO_DB_SSL_REQUIRE=false
DJANGO_ALLOWED_HOSTS=$SITE_ADDRESS,localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=$CORS_ORIGIN
DJANGO_CSRF_TRUSTED_ORIGINS=$CORS_ORIGIN
CELERY_BROKER_URL=redis://127.0.0.1:6379/0
CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/0
RAG_DOCUMENTS_DIR=$DATA_DIR/documents
HF_HOME=$DATA_DIR/hf-cache
EOF
    chmod 600 "$ENV_FILE"
    echo "wrote $ENV_FILE"
else
    echo "keeping existing $ENV_FILE"
fi

DB_PASSWORD="$(sed -n 's|^DATABASE_URL=postgresql://[^:]*:\([^@]*\)@.*|\1|p' "$ENV_FILE")"
if [ -z "$DB_PASSWORD" ]; then
    echo "could not read the database password from $ENV_FILE" >&2
    exit 1
fi

echo "== database =="
systemctl enable --now postgresql redis-server
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    sudo -u postgres psql -q -c "ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD'"
else
    sudo -u postgres psql -q -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD'"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    sudo -u postgres psql -q -c "CREATE DATABASE $DB_NAME OWNER $DB_USER"
fi

echo "== django setup =="
as_app() {
    sudo -u "$APP_USER" bash -c "set -a; . '$ENV_FILE'; set +a; $1"
}
as_app "'$PY' '$APP_DIR/backend/manage.py' migrate --noinput"
as_app "'$PY' '$APP_DIR/backend/manage.py' collectstatic --noinput"

echo "== model weights =="
sudo -u "$APP_USER" bash -c "set -a; . '$ENV_FILE'; set +a; '$PY' -" <<'PY'
from sentence_transformers import SentenceTransformer, CrossEncoder

SentenceTransformer("all-MiniLM-L6-v2")
CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
print("models ready")
PY

echo "== systemd =="
cat > /etc/systemd/system/documind.service <<EOF
[Unit]
Description=DocuMind backend
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$ENV_FILE
ExecStartPre=$PY manage.py migrate --noinput
ExecStart=$APP_DIR/venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 1 --worker-class gthread --threads 4 --timeout 300
Restart=always
RestartSec=5
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable documind

echo "== caddy =="
cat > /etc/caddy/Caddyfile <<EOF
$SITE_ADDRESS {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8000
}
EOF
systemctl enable caddy
systemctl restart caddy

echo "== firewall =="
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== start =="
systemctl restart documind

ready=0
for _ in $(seq 1 30); do
    if curl -fsS -H "X-Forwarded-Proto: https" http://127.0.0.1:8000/api/health/ >/dev/null; then
        ready=1
        break
    fi
    sleep 2
done

if [ "$ready" -ne 1 ]; then
    echo "the backend did not answer. Check: journalctl -u documind -n 100" >&2
    exit 1
fi

echo
echo "Done."
echo "  API:    https://$SITE_ADDRESS/api/health/"
echo "  Logs:   journalctl -u documind -f"
echo "  Config: $ENV_FILE"
echo
echo "If the public URL does not answer, open TCP 80 and 443 in the OCI security list."
