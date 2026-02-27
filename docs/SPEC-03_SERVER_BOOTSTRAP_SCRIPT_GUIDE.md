# SPEC-03 Server Bootstrap Script Guide (Ubuntu)

This guide explains how to use:
- `deploy/scripts/bootstrap_ubuntu_chirin.sh.example`

Use this when you are ready to provision a new staging/production server.

---

## 1) What the script does

It automates:
1. apt update/upgrade
2. install Python, Node, Nginx, certbot, PostgreSQL client
3. clone/update repo
4. setup backend venv + dependencies
5. build frontend and deploy `dist`
6. run migrate + collectstatic + check
7. install systemd and nginx templates
8. start backend service + reload nginx

It does NOT auto-issue SSL certs (for safety). It prints certbot commands at end.

---

## 2) Before running

You must set in script variables:
- `REPO_URL`
- `DOMAIN_FRONTEND`
- `DOMAIN_FRONTEND_WWW`
- `DOMAIN_API`
- optional `APP_USER`, `PROJECT_ROOT`

You must prepare backend env:
- create `/srv/chirin/backend/.env.production`
- fill real secret and DB values

Use template:
- `backend/.env.production.example`

---

## 3) How to run

On server:

```bash
cd /srv/chirin
# or wherever repo lives
bash deploy/scripts/bootstrap_ubuntu_chirin.sh.example
```

If file is outside `/srv/chirin`, copy first or run from repo root.

---

## 4) After script finishes

Run SSL commands printed by script:

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
sudo certbot --nginx -d api.yourdomain.com
```

Then run smoke tests from:
- `docs/SPEC-03_DEPLOYMENT_CHECKLIST.md`

---

## 5) If script fails

1. Read error line and stop there.
2. Fix that issue.
3. Re-run script.

Useful logs:
```bash
sudo systemctl status chirin-backend
sudo journalctl -u chirin-backend -n 200 --no-pager
sudo nginx -t
```

---

## 6) Safety notes

- This is a template script, not a hidden black box.
- Review all lines before running in production.
- Keep secrets only in `.env.production` (never commit secrets).
