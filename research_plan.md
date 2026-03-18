# Comprehensive Security Plan for RAG Web App

**Role:** Senior Cybersecurity Architect  
**Framework:** OWASP Top 10  
**Target Architecture:** React Frontend (SPA) + Django REST Framework Backend + PostgreSQL/SQLite + LLM Integrations (OpenAI, Gemini, etc.) + Render Deployment

---

## 1. Asset & Risk Assessment

### Crown Jewel Data

* **LLM API Keys:** Stored in the database (`UserProfile.llm_api_key`) in plaintext (Currently). **High Risk.**
* **User Uploaded Documents:** PII, proprietary code, or confidential data stored in `documents/` directory or parsed into vector/Faiss indexes. **High Risk.**
* **Authentication Tokens:** JWT Access and Refresh tokens. **Medium Risk.**
* **Chat History & Feedbacks:** (`ChatMessage`, `ChatFeedback`) Potentially sensitive user queries. **Medium Risk.**
* **User PII:** Usernames, passwords (hashed), emails in Django Auth.

### Attack Surface Mapping

1. **Public API Endpoints:** `/api/ask/`, `/api/upload/`, `/api/url_ingest/`. Vulnerable to Prompt Injection, DoS, and SSRF (URL ingest feature).
2. **Authentication Surface:** `/api/token/`, `/api/signup/`. Vulnerable to brute force and credential stuffing.
3. **Frontend Inputs:** Chat interface and Document Uploads. Vulnerable to XSS and Malicious File Uploads.
4. **Third-Party Dependencies:** Vulnerabilities in `requirements.txt` (Django, psycopg, langchain, etc.) and React `package.json` packages.
5. **External Integrations:** LLM API providers (OpenAI, Anthropic). API key leakage or Man-in-the-Middle (MITM).

---

## 2. Technical Controls (OWASP Focus)

* **A01:2021-Broken Access Control & A05:2021-Security Misconfiguration:**
  * **Sitewide SSL/TLS & HSTS:** Ensure `SECURE_SSL_REDIRECT = True` and enforce `Strict-Transport-Security (HSTS)` headers with `includeSubDomains` and `preload` in production. Configured via `render.yaml` and Django `settings.py`.
  * **Secure Headers:** Enforce `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (already present), `Referrer-Policy: strict-origin-when-cross-origin`, and a rigorous `Content-Security-Policy (CSP)` tailored for React, restricting `script-src` and `connect-src` to known domains.
  * **Web Application Firewall (WAF):** Deploy Cloudflare or AWS WAF in front of the Render environment to block common injection attacks, malicious bots, and apply rate limiting at the edge.
* **A03:2021-Injection (Prompt, SQL, & Command):**
  * **SQL Injection:** Use Django ORM strictly (Django inherently protects against SQLi). Avoid raw SQL queries.
  * **Prompt Injection / Jailbreaking:** Implement strict input validation, length limits, and system prompt delimiters for LLM prompts to mitigate Prompt Injection. Consider integrating an LLM security firewall for input/output sanitization.
  * **Command Injection:** Ensure no user input is ever passed to OS-level commands (e.g., `os.system` or `subprocess`).
* **A07:2021-Identification and Authentication Failures:**
  * **Password Policies:** Enforce strong password policies using Django's `AUTH_PASSWORD_VALIDATORS` (Minimum length 12, complexity requirements, dictionary checks). Implement account lockout mechanisms after repeated failed attempts.
  * **Secure JWTs:** Store access tokens in memory or Web Workers (frontend), and Refresh Tokens in `HttpOnly, Secure, SameSite=Strict` cookies. Never store tokens in LocalStorage or SessionStorage to prevent XSS exfiltration. Implement token rotation.

---

## 3. Identity & Access Management (IAM)

* **Multi-Factor Authentication (MFA):** Integrate MFA (via TOTP using libraries like `django-mfa2` or WebAuthn/FIDO2) for all accounts. Make it mandatory for critical actions or Admin access.
* **Role-Based Access Control (RBAC):** Define clear, granular roles (e.g., `Standard User`, `Admin`). Strictly enforce decorators/permissions on views (e.g., `IsAdminUser` for sensitive endpoints, Object-level permissions for User Documents).
* **Principle of Least Privilege (PoLP):** Ensure the Render application process runs as a non-root user. Database credentials used by the app should only have DML rights (Data Manipulation), not DDL (Data Definition) after initial migrations are applied. Service accounts should have minimum necessary scopes.
* **API Key Management (LLMs):** Do not store user API keys in plaintext. Use symmetric encryption (AES-256-GCM) via libraries like `django-fernet-fields` or a dedicated secrets manager (e.g., HashiCorp Vault). Never log API keys.

---

## 4. Infrastructure, Database & API Security

### Database Specific Security

* **Network Isolation:** Ensure the Render PostgreSQL database is NOT publicly accessible (restrict IP access to only the Vercel/Render backend IP ranges).
* **Encryption in Transit:** Enforce TLS/SSL for all database connections (`DJANGO_DB_SSL_REQUIRE=true`).
* **Encryption at Rest:** Utilize Render's native volume encryption for the PostgreSQL instance. Use SQLite encryption (e.g., SQLCipher) if running locally.
* **Backup & Retention:** Configure Point-in-Time Recovery (PITR) and enforce daily automated backups. Store backups in a secure, separate geographical location.
* **Database Credentials Rotation:** Frequently rotate the `DATABASE_URL` credentials using Render's managed database secrets.

### Backend Infrastructure

* **Server Hardening:**
  * Hide server versions (remove `Server: gunicorn` headers).
  * Disable debug mode strictly in production (`DJANGO_DEBUG=false`).
* **Rate Limiting & DoS Protection:**
  * Implement Django REST Framework rate limiting (e.g., `AnonRateThrottle`, `UserRateThrottle`) on `/api/ask/` and auth endpoints to prevent API abuse and control LLM costs.
  * Enhance the custom `UsageTrackingMiddleware` to block users exceeding quotas.
* **SSRF Protection:** Ensure the `/api/url_ingest/` strictly validates and sanitizes URLs using an allowlist or local IP blocking (currently in progress with `_is_private_or_local_host` check).
* **Third-Party Dependency Security:**
  * Run automated scanning locally/CI: `pip-audit`, `Safety`, and `npm audit`.
  * Pin dependencies tightly and establish a weekly update rotation.

---

## 5. Monitoring & Incident Response

### 24/7 Logging Strategy

* **Centralized Logging:** Aggregate logs using ELK Stack (Elasticsearch, Logstash, Kibana) or Datadog via Django logging handlers.
* **Audit Trails:** Log all authentication events, document uploads, and API usage (already tracked via `APIUsageLog`).
* **Alerting Rules:** Trigger high-priority alerts for: >5 failed logins from one IP, sudden spikes in `/api/ask/` volume (Cost/DoS anomaly), or 500 Internal Server Errors.

### Step-by-Step Recovery Playbook

1. **Preparation:** Maintain automated daily database backups and infrastructure as code (`render.yaml`).
2. **Identification:** SOC/Admin validates the alert (e.g., breached LLM key).
3. **Containment:** Instantly revoke affected JWTs via the token blacklist (`rest_framework_simplejwt.token_blacklist`). Disable the compromised user account.
4. **Eradication:** Patch the vulnerability (e.g., fixing an SSRF bypass). Rotate all server-side API keys and database passwords.
5. **Recovery:** Restore from backup if data integrity was compromised. Deploy patched version.
6. **Post-Incident:** Conduct a root-cause analysis and update the threat model.

---

## 6. Compliance Roadmap (GDPR, PCI-DSS context)

Given the storage of User PII, API Keys, and potentially sensitive uploaded documents, strict compliance control is critical.

* **Data Subject Access Requests (DSAR) & "Right to be Forgotten":** Implement a fully automated `/api/user/delete/` endpoint that ensures hard cascading deletion across `User`, `Document`, `ChatMessage`, vector indexes (Faiss), and physical files in the `documents/` directory. Provide a mechanism for users to download their data payload.
* **Data Minimization & Retention Policies:** Only scrape and extract necessary text from URLs/documents. Implement automated cron jobs to purge `ChatMessage` history or inactive `Document` files after a defined retention period (e.g., 90 days).
* **Consent Management:** Add explicit, granular Privacy Policy and Terms of Service acceptance toggles on the React Signup page before any data collection occurs. Log the timestamp and IP of consent.
* **Data Mapping & Processing Register:** Maintain a live document mapping how PII flows from the React frontend $\rightarrow$ Django Backend $\rightarrow$ LLM Providers (Third Party) $\rightarrow$ PostgreSQL Database.
* **Vendor Risk Management:** Ensure LLM Providers (OpenAI, Gemini) have signed Data Processing Agreements (DPAs) and are configured to NOT use user-submitted queries for model training (Zero Data Retention where possible).

---

## 7. Prioritization Roadmap (Checklist)

### 🔴 Immediate (Days 1-14)

* [ ] **Data:** Encrypt user LLM API Keys in the `UserProfile` model at rest.

* [ ] **Auth:** Move JWT Refresh tokens from LocalStorage to `HttpOnly` Secure Cookies.
* [ ] **API:** Implement Strict Rate Limiting on authentication, `/api/ask/`, and URL ingest endpoints.
* [ ] **Infra:** Set up `pip-audit` & `npm audit` in the CI/CD pipeline.

### 🟡 Short-Term (Month 1-2)

* [ ] **Config:** Enforce HSTS and configure a strict Content-Security-Policy (CSP) in Django.

* [ ] **IAM:** Implement simple Multi-Factor Authentication (MFA) for users.
* [ ] **Monitoring:** Implement a centralized logging solution (e.g., Datadog, Sentry) and configure Critical Alerts.
* [ ] **Compliance:** Implement "Right to be Forgotten" account deletion mechanisms covering local files.

### 🟢 Long-Term (Month 3-6)

* [ ] **Infra:** Deploy a Web Application Firewall (WAF) to filter malicious bot and injection traffic.

* [ ] **Validation:** Conduct regular Penetration Testing and Threat Modeling sessions.
* [ ] **Compliance:** Finalize full GDPR/SOC2 compliance documentation and automated data retention purging.
