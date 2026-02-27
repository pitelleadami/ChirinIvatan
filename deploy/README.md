# Deployment Templates

This folder contains ready-to-edit deployment templates.

## Files
- `deploy/systemd/chirin-backend.service.example`
  - systemd service for Gunicorn backend.
- `deploy/nginx/chirin.conf.example`
  - Nginx config for frontend + backend reverse proxy.

## How to use
1. Copy files to server locations:
   - systemd -> `/etc/systemd/system/chirin-backend.service`
   - nginx -> `/etc/nginx/sites-available/chirin.conf`
2. Replace placeholders and domain/path values.
3. Enable services:
   - `sudo systemctl daemon-reload`
   - `sudo systemctl enable --now chirin-backend`
   - `sudo ln -s /etc/nginx/sites-available/chirin.conf /etc/nginx/sites-enabled/chirin.conf`
   - `sudo nginx -t && sudo systemctl reload nginx`
4. Issue SSL certs via certbot.

See also:
- `docs/PUBLIC_DEPLOYMENT_TEMPLATE.md`
- `docs/PUBLIC_DEPLOYMENT_TEMPLATE.md`
