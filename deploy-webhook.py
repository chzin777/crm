#!/usr/bin/env python3
import hmac, hashlib, json, subprocess, sys, os
from http.server import HTTPServer, BaseHTTPRequestHandler

SECRET = open('/opt/crm/.webhook-secret').read().strip()
LOG_FILE = '/var/log/crm-deploy.log'

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        sig = self.headers.get('X-Hub-Signature-256', '')
        expected = 'sha256=' + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b'unauthorized')
            return
        try:
            payload = json.loads(body)
            ref = payload.get('ref', '')
            if ref != 'refs/heads/main':
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'ignored branch')
                return
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'deploy triggered')
            with open(LOG_FILE, 'a') as log:
                log.write(f'[CRM] Deploy triggered by {payload.get("pusher",{}).get("name","unknown")}\n')
            subprocess.Popen(
                ['bash', '-c', 'cd /opt/crm && git pull origin main >> /var/log/crm-deploy.log 2>&1 && docker compose up -d --build >> /var/log/crm-deploy.log 2>&1 && echo "Exit: 0" >> /var/log/crm-deploy.log || echo "Exit: 1" >> /var/log/crm-deploy.log'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True
            )
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode())

HTTPServer(('0.0.0.0', 9003), Handler).serve_forever()