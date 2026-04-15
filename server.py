#!/usr/bin/env python3
"""
Local development server with CORS proxy for Vegvesen Parking Registry API.
Serves static files and proxies API requests to the Vegvesen API.
"""

import http.server
import urllib.request
import urllib.parse
import urllib.error
import json
import os
import hashlib
import sys
from concurrent.futures import ThreadPoolExecutor
import ssl
import imaplib
import email as email_lib
from email.header import decode_header
from datetime import datetime, timedelta
import base64
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

PORT = int(os.environ.get('PORT', 8080))
VEGVESEN_BASE = 'https://parkreg-open.atlas.vegvesen.no/ws/no/vegvesen/veg/parkeringsomraade/parkeringsregisteret/v1'
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

# Load .env file for mail credentials
ENV_FILE = os.path.join(STATIC_DIR, '.env')
if os.path.exists(ENV_FILE):
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, _, value = line.partition('=')
                os.environ.setdefault(key.strip(), value.strip())

# Mail accounts config
MAIL_ACCOUNTS = {
    'post': {'user': 'post@christianiaoppmerking.no', 'password': ''},
    'knut': {'user': 'knut@christianiaoppmerking.no', 'password': ''}
}

# Override with environment variables if present
for i in range(1, 5):
    user = os.environ.get(f'MAIL_USER_{i}', '')
    pwd = os.environ.get(f'MAIL_PASS_{i}', '')
    if user:
        key = user.split('@')[0]
        if key in MAIL_ACCOUNTS:
            MAIL_ACCOUNTS[key]['password'] = pwd
        else:
            MAIL_ACCOUNTS[key] = {'user': user, 'password': pwd}

# File for local email cache
MAIL_CACHE_FILE = os.path.join(STATIC_DIR, 'mail_cache.json')
BLOCKED_SENDERS_FILE = os.path.join(STATIC_DIR, 'blocked_senders.json')

class MailCache:
    """Handles local persistence of flagged emails to avoid repeated IMAP fetches."""
    def __init__(self, cache_file):
        self.cache_file = cache_file
        self.data = self._load()

    def _load(self):
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"DEBUG: Could not load cache: {e}")
        return {}

    def save(self):
        try:
            with open(self.cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"DEBUG: Could not save cache: {e}")

    def get_emails(self, account=None):
        """Returns all cached emails, optionally filtered by account."""
        emails = list(self.data.values())
        if account:
            emails = [e for e in emails if e.get('_accountKey') == account]
        # Sort by date newest first
        emails.sort(key=lambda x: x.get('date', ''), reverse=True)
        return emails

    def add_emails(self, new_emails, account_key):
        """Merges new emails into the cache and performs cleanup of old entries."""
        added_count = 0
        for email in new_emails:
            stable_key = hashlib.sha256(f"{account_key}:{email['from_email']}:{email['subject']}:{email['date']}".encode()).hexdigest()
            
            if stable_key not in self.data:
                email['_accountKey'] = account_key
                self.data[stable_key] = email
                added_count += 1
        
        # Cleanup: Remove emails older than 90 days
        self._cleanup()
        
        if added_count > 0:
            self.save()
        return added_count

    def remove_by_domain(self, domain):
        """Remove cached emails from a blocked domain."""
        domain = domain.lower()
        to_delete = [k for k, v in self.data.items() if domain in v.get('from_email', '').lower()]
        for key in to_delete:
            del self.data[key]
        if to_delete:
            self.save()
        return len(to_delete)

    def _cleanup(self, max_days=90):
        """Removes entries older than max_days."""
        cutoff = datetime.now() - timedelta(days=max_days)
        to_delete = []
        for key, email in self.data.items():
            try:
                date_str = email.get('date', '')
                if 'T' in date_str:
                    email_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    if email_date.tzinfo and not cutoff.tzinfo:
                        from datetime import timezone
                        cutoff_tz = cutoff.replace(tzinfo=timezone.utc)
                        if email_date < cutoff_tz:
                            to_delete.append(key)
                    elif email_date < cutoff:
                        to_delete.append(key)
            except Exception as e:
                print(f"DEBUG: Cleanup error for {key}: {e}")
        
        for key in to_delete:
            del self.data[key]
        
        if to_delete:
            print(f"DEBUG: Cleaned up {len(to_delete)} old email entries from cache.")


class BlockedSenders:
    """Dynamic blocklist that persists to JSON. Users can add domains at runtime."""
    def __init__(self, filepath):
        self.filepath = filepath
        self.data = self._load()

    def _load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return {'domains': [], 'emails': []}

    def save(self):
        try:
            with open(self.filepath, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"DEBUG: Could not save blocked senders: {e}")

    def block_domain(self, domain):
        domain = domain.lower().strip()
        if domain and domain not in self.data['domains']:
            self.data['domains'].append(domain)
            self.save()
            return True
        return False

    def block_email(self, email_addr):
        email_addr = email_addr.lower().strip()
        if email_addr and email_addr not in self.data['emails']:
            self.data['emails'].append(email_addr)
            self.save()
            return True
        return False

    def is_blocked(self, from_email):
        from_email = from_email.lower()
        # Check exact email match
        if from_email in self.data.get('emails', []):
            return True
        # Check domain match
        for d in self.data.get('domains', []):
            if d in from_email:
                return True
        return False

    def get_all(self):
        return self.data


# Initialize global cache and blocklist
mail_cache = MailCache(MAIL_CACHE_FILE)
blocked_senders = BlockedSenders(BLOCKED_SENDERS_FILE)

# Keywords that suggest an email is a quote request for marking work
QUOTE_KEYWORDS = [
    'tilbud', 'pris', 'prise', 'anbud', 'anbudsforespørsel',
    'oppmerking', 'merking', 'vegmerking', 'oppmerke',
    'parkering', 'parkeringsplass', 'p-plass', 'hc-plass',
    'maling', 'termoplast', 'demarkering', 'kaldplast',
    'gangfelt', 'fotgjengerfelt', 'linje', 'linjemerking',
    'skilting', 'asfalt', 'elbil', 'strekning',
    'forespørsel', 'pristilbud', 'kostnadsoverslag', 'estimat',
    'befaring', 'befar', 'oppmåling',
    'sykkelsti', 'sykkelfelt', 'fartshumper',
    'sperre', 'sperreområde', 'rutemønster',
    'pil', 'tekst på asfalt', 'symbol',
    # Broader terms to catch more inquiries
    'bestilling', 'bestille', 'oppdrag', 'jobb', 'arbeid',
    'male', 'merke', 'striper', 'stripe',
    'garasje', 'parkeringshus', 'parkeringsanlegg', 'kjeller',
    'gulv', 'dekke', 'belegg', 'epoxy',
    'hc', 'handikap', 'funksjonshemmet',
    'lading', 'ladestasjon', 'lade',
    'skilt', 'vegoppmerking',
    'tomt', 'eiendom', 'bygg', 'prosjekt',
    'kan dere', 'ønsker', 'trenger', 'behov',
    'vedlikehold', 'fornye', 'fornyelse',
    'kjøresenter', 'varemottak',
]


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    """Handles static files and proxies /api/* requests to Vegvesen."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        if self.path.startswith('/api/'):
            self._proxy_request()
        elif self.path.startswith('/mail/'):
            self._handle_mail()
        elif self.path.startswith('/maps/'):
            self._proxy_maps()
        elif self.path.startswith('/streetview/'):
            self._proxy_streetview()
        else:
            super().do_GET()

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self._add_cors_headers()
        self.end_headers()

    def do_POST(self):
        """Handle POST requests."""
        if self.path.startswith('/mail/send'):
            self._handle_send_mail()
        elif self.path.startswith('/mail/block'):
            self._handle_block_sender()
        else:
            self.send_response(404)
            self._add_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Not found'}).encode())

    def _proxy_request(self):
        # Strip /api/ prefix and build Vegvesen URL
        api_path = self.path[5:]  # Remove '/api/'
        target_url = VEGVESEN_BASE + '/' + api_path

        try:
            # Create SSL context that doesn't verify (for dev only)
            ctx = ssl.create_default_context()
            
            req = urllib.request.Request(target_url)
            req.add_header('User-Agent', 'ParkTegn/1.0')
            req.add_header('Accept', 'application/json, application/pdf, */*')

            with urllib.request.urlopen(req, timeout=120, context=ctx) as response:
                content_type = response.headers.get('Content-Type', 'application/octet-stream')
                data = response.read()

                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(data)))
                self._add_cors_headers()
                self.end_headers()
                self.wfile.write(data)

        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self._add_cors_headers()
            self.end_headers()
            error_msg = json.dumps({'error': f'Vegvesen API error: {e.code} {e.reason}'})
            self.wfile.write(error_msg.encode())

        except Exception as e:
            self.send_response(502)
            self._add_cors_headers()
            self.end_headers()
            error_msg = json.dumps({'error': f'Proxy error: {str(e)}'})
            self.wfile.write(error_msg.encode())

    def _proxy_maps(self):
        """Proxy satellite image requests using Google Maps satellite tiles (top-down ortofoto)."""
        try:
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)

            lat = float(params.get('lat', [59.9139])[0])
            lng = float(params.get('lng', [10.7522])[0])
            zoom = int(params.get('zoom', [19])[0])

            import math

            # Convert lat/lng to tile coordinates
            n = 2 ** zoom
            x_tile = int((lng + 180.0) / 360.0 * n)
            y_tile = int((1.0 - math.log(math.tan(math.radians(lat)) + 1.0 / math.cos(math.radians(lat))) / math.pi) / 2.0 * n)

            # Fetch a grid of tiles and stitch them
            grid_size = 5  # 5x5 grid = 1280x1280
            tile_size = 256
            half = grid_size // 2

            try:
                from PIL import Image as PILImage
                import io

                result_img = PILImage.new('RGB', (grid_size * tile_size, grid_size * tile_size))

                ctx = ssl.create_default_context()

                for dy in range(grid_size):
                    for dx in range(grid_size):
                        tx = x_tile - half + dx
                        ty = y_tile - half + dy
                        tile_url = f'https://mt1.google.com/vt/lyrs=s&x={tx}&y={ty}&z={zoom}'

                        req = urllib.request.Request(tile_url)
                        req.add_header('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')

                        try:
                            with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                                tile_data = resp.read()
                                tile_img = PILImage.open(io.BytesIO(tile_data))
                                result_img.paste(tile_img, (dx * tile_size, dy * tile_size))
                        except Exception:
                            pass  # Skip failed tiles

                buf = io.BytesIO()
                result_img.save(buf, format='PNG')
                data = buf.getvalue()

            except ImportError:
                # PIL not available – return single center tile
                ctx = ssl.create_default_context()
                tile_url = f'https://mt1.google.com/vt/lyrs=s&x={x_tile}&y={y_tile}&z={zoom}'
                req = urllib.request.Request(tile_url)
                req.add_header('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')

                with urllib.request.urlopen(req, timeout=30, context=ctx) as response:
                    data = response.read()

            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.send_header('Content-Length', str(len(data)))
            self._add_cors_headers()
            self.end_headers()
            self.wfile.write(data)

        except Exception as e:
            self.send_response(502)
            self._add_cors_headers()
            self.end_headers()
            error_msg = json.dumps({'error': f'Maps proxy error: {str(e)}'})
            self.wfile.write(error_msg.encode())

    def _proxy_streetview(self):
        """Proxy Google Street View images from cbk0 endpoint."""
        try:
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)

            lat = float(params.get('lat', [59.9139])[0])
            lng = float(params.get('lng', [10.7522])[0])
            heading = int(params.get('heading', [0])[0])
            pitch = int(params.get('pitch', [0])[0])
            fov = int(params.get('fov', [90])[0])

            sv_url = (
                f'https://cbk0.googleapis.com/cbk?output=thumbnail'
                f'&w=800&h=450&ll={lat},{lng}'
                f'&yaw={heading}&pitch={pitch}&thumbfov={fov}'
            )

            ctx = ssl.create_default_context()
            req = urllib.request.Request(sv_url)
            req.add_header('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')

            with urllib.request.urlopen(req, timeout=15, context=ctx) as response:
                data = response.read()
                content_type = response.headers.get('Content-Type', 'image/jpeg')
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(data)))
                self._add_cors_headers()
                self.end_headers()
                self.wfile.write(data)

        except Exception as e:
            self.send_response(502)
            self._add_cors_headers()
            self.end_headers()
            error_msg = json.dumps({'error': f'Street View proxy error: {str(e)}'})
            self.wfile.write(error_msg.encode())

    # ===== Mail (IMAP) handler =====

    def _handle_mail(self):
        """Handle /mail/* requests for flagged email scanning."""
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path == '/mail/accounts':
            # Return list of configured accounts
            accounts = []
            for key, acc in MAIL_ACCOUNTS.items():
                accounts.append({'key': key, 'email': acc['user']})
            self._send_json(accounts)
            return

        if path == '/mail/flagged':
            account_key = params.get('account', [''])[0]
            days = params.get('days', ['30'])[0]
            try:
                days_int = int(days)
            except:
                days_int = 30

            if not account_key and MAIL_ACCOUNTS:
                account_key = list(MAIL_ACCOUNTS.keys())[0]

            # Determine target user and default password
            if account_key in MAIL_ACCOUNTS:
                acc = MAIL_ACCOUNTS[account_key]
                user_email = acc['user']
                default_pwd = acc.get('password', '')
            elif '@' in account_key:
                # It's a full email address entered by user
                user_email = account_key
                default_pwd = ''
            else:
                self._send_json({'error': f'Ukjent konto eller ugyldig e-post: {account_key}'}, 400)
                return

            pwd = self.headers.get('X-Mail-Password', default_pwd)
            
            if not pwd:
                self._send_json({'error': f'Password required for {user_email}', 'account': user_email}, 401)
                return

            try:
                # 1. Fetch new emails since last fetch (using days_int) from IMAP
                newly_fetched = self._fetch_flagged_emails(user_email, pwd, days_back=days_int)
                
                # 2. Add to persistent cache (this also saves to disk)
                # Note: account_key is used here to group emails in the cache
                mail_cache.add_emails(newly_fetched, account_key)
                
                # 3. Return the full combined cache for this account
                # This ensures old emails stay in the list even if IMAP search range is small
                final_list = mail_cache.get_emails(account=account_key)
                self._send_json(final_list)
            except imaplib.IMAP4.error as e:
                self._send_json({'error': f'Authentication failed for {user_email}: {str(e)}'}, 401)
            except Exception as e:
                self._send_json({'error': f'Feil ved henting av e-post for {user_email}: {str(e)}'}, 500)
            return

        if path == '/mail/blocked':
            self._send_json(blocked_senders.get_all())
            return

        self._send_json({'error': 'Ukjent mail-endepunkt'}, 404)

    def _handle_block_sender(self):
        """Handle POST /mail/block – block a domain or email from future results."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))

            domain = data.get('domain', '')
            email_addr = data.get('email', '')

            results = {'blocked_domains': [], 'blocked_emails': [], 'removed_cached': 0}

            if domain:
                blocked_senders.block_domain(domain)
                results['blocked_domains'].append(domain)
                # Also remove from cache
                removed = mail_cache.remove_by_domain(domain)
                results['removed_cached'] = removed

            if email_addr:
                blocked_senders.block_email(email_addr)
                results['blocked_emails'].append(email_addr)

            print(f"  🚫 Blocked: domain={domain} email={email_addr} (removed {results['removed_cached']} cached)")
            self._send_json({'success': True, **results})

        except Exception as e:
            self._send_json({'error': f'Block error: {str(e)}'}, 500)

    def _handle_send_mail(self):
        """Handle POST /mail/send – send an email with PDF attachment via SMTP."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))

            to_email = data.get('to_email', '')
            subject = data.get('subject', 'Pristilbud – Christiania Oppmerking AS')
            body_text = data.get('body_text', '')
            pdf_base64 = data.get('pdf_base64', '')
            pdf_filename = data.get('pdf_filename', 'Tilbud.pdf')

            if not to_email:
                self._send_json({'error': 'Mangler mottaker-e-post'}, 400)
                return

            # Use 'post' account for sending
            if 'post' not in MAIL_ACCOUNTS:
                self._send_json({'error': 'post@-kontoen er ikke konfigurert'}, 500)
                return

            sender_email = MAIL_ACCOUNTS['post']['user']
            sender_pass = self.headers.get('X-Mail-Password', MAIL_ACCOUNTS['post']['password'])
            
            if not sender_pass:
                self._send_json({'error': 'Password required for SMTP'}, 401)
                return

            bcc_email = data.get('bcc_email', '')

            # Build MIME email
            msg = MIMEMultipart()
            msg['From'] = f'Christiania Oppmerking AS <{sender_email}>'
            msg['To'] = to_email
            msg['Subject'] = subject
            if bcc_email:
                msg['Bcc'] = bcc_email

            # Body text
            msg.attach(MIMEText(body_text, 'plain', 'utf-8'))

            # PDF attachment (optional)
            if pdf_base64:
                pdf_bytes = base64.b64decode(pdf_base64)
                pdf_part = MIMEApplication(pdf_bytes, _subtype='pdf')
                pdf_part.add_header('Content-Disposition', 'attachment', filename=pdf_filename)
                msg.attach(pdf_part)

            # Custom attachments
            custom_attachments = data.get('custom_attachments', [])
            for file_obj in custom_attachments:
                try:
                    att_filename = file_obj.get('filename', 'vedlegg')
                    att_b64 = file_obj.get('base64', '')
                    att_type = file_obj.get('contentType', 'application/octet-stream')
                    
                    if att_b64:
                        att_bytes = base64.b64decode(att_b64)
                        # We extract the subtype from content-type if available
                        subtype = att_type.split('/')[-1] if '/' in att_type else 'octet-stream'
                        
                        part = MIMEApplication(att_bytes, _subtype=subtype)
                        part.add_header('Content-Disposition', 'attachment', filename=att_filename)
                        msg.attach(part)
                except Exception as e:
                    print(f"Advarsel: Kunne ikke legge ved {file_obj.get('filename')}: {e}")

            # Send via One.com SMTP
            print(f'  📧 Sender e-post til {to_email}...')
            with smtplib.SMTP_SSL('send.one.com', 465) as smtp:
                smtp.login(sender_email, sender_pass)
                smtp.send_message(msg)

            print(f'  ✅ E-post sendt til {to_email}')
            self._send_json({'success': True, 'message': f'Tilbud sendt til {to_email}'})

        except smtplib.SMTPAuthenticationError:
            print(f'  ❌ SMTP-autentisering feilet')
            self._send_json({'error': 'SMTP-innlogging feilet. Sjekk passord i .env'}, 500)
        except Exception as e:
            print(f'  ❌ Feil ved sending: {e}')
            self._send_json({'error': f'Kunne ikke sende e-post: {str(e)}'}, 500)

    def _fetch_flagged_emails(self, username, password, days_back=30):
        """Connect to One.com IMAP and fetch relevant emails from last N days."""
        imap_host = 'imap.one.com'
        imap_port = 993

        # Calculate date filter
        since_date = (datetime.now() - timedelta(days=days_back)).strftime('%d-%b-%Y')

        mail = imaplib.IMAP4_SSL(imap_host, imap_port)
        try:
            mail.login(username, password)
            mail.select('INBOX', readonly=True)

            # Search ALL emails since date
            status, msg_ids = mail.search(None, f'(SINCE {since_date})')
            if status != 'OK' or not msg_ids[0]:
                return []

            id_list = msg_ids[0].split()
            emails = []

            # --- BLOCKED DOMAINS (checked on headers only) ---
            skip_domains = [
                'christianiaoppmerking.no', 'linkedin.com',
                'motek.no', 'teknos.com', 'teknos.no', 'metal-master.shop',
                'nfh.as', 'novtech.no', 'doka-mail.com',
                'seilmagasinet.no', 'strawberry.no', 'megger.no', 'mobit.no',
                'faircarinsurance.com', 'nordea.no', 'nordnet.no', 'uscore.no',
                'lendo.no', 'adv-finance.com',
                'econa.no', 'devinco.com', 'virke.no', 'styreforeningen.no',
                'new-skills.no', 'liveexpo.se',
                'power.no', 'cedesa.es',
                'bws.net',
                'autosync.no', 'abax.com',
                'gevekomarkings.com',
                'fakturereenkelt.com', 'mailcloudlead.com', 'fluxara-7.com',
                'core-temp.no', 'trackday.no', 'tidsbanken.no',
                'lf-norge.com', 'lfdesign-norge.com',
                'log.no', 'railway.app', 'stripe.com', 'smartsheet.com',
            ]

            # --- BLOCKED SUBJECTS ---
            skip_subjects = [
                'oppgjør', 'firmabil', 'forsikring', 'skademelding', 'bilforsikring',
                'oppsigelse av firmabil',
                'nyhetsbrev', 'newsletter',
                'reset your password', 'passord',
                'webinar', 'miljøforum',
                'surcharge', 'baf ',
                'kredittscore', 'bedriftskunde', 'likviditet', 'investeringslån',
                'rentemøte', 'boligverdi', 'boligpriser',
                'turer utenfor arbeidstid', 'autopass',
                'automatic reply', 'autosvar', 'out of office',
                'ordrebekreftelse', 'order no:',
                'onboarding', 'ticket#',
                'styrekandidat', 'bonus- og aksjeprogram', 'vernerunder',
                'årshjul', 'ferieoversikt', 'ferieplanlegging', 'timeregistrering',
                'vanskelige personer', 'spar ', 'spare penger',
                'book tid', 'byggestart', 'på lager',
                'siste sjanse', 'selgende hjemmeside',
                'vårrengjøring', 'speed bump', 'your receipt from',
                'breem', 'takprodukter', 'finér',
            ]

            print(f'  📬 Found {len(id_list)} emails since {since_date}')

            # ========== PASS 1: Fetch HEADERS ONLY (fast) ==========
            # This avoids downloading full email bodies + attachments for spam
            candidates = []
            for msg_id in id_list:
                try:
                    status, hdr_data = mail.fetch(msg_id, '(BODY[HEADER.FIELDS (FROM SUBJECT DATE)])')
                    if status != 'OK':
                        continue

                    hdr_bytes = hdr_data[0][1]
                    hdr_msg = email_lib.message_from_bytes(hdr_bytes)

                    # Decode sender
                    from_raw = hdr_msg.get('From', '')
                    from_name, from_email_addr = self._parse_from(from_raw)

                    # Quick domain check (static + dynamic blocklist)
                    email_lower = from_email_addr.lower()
                    if any(d in email_lower for d in skip_domains):
                        continue
                    if blocked_senders.is_blocked(email_lower):
                        continue

                    # Decode subject
                    subject = self._decode_mime_header(hdr_msg.get('Subject', '(Uten emne)'))
                    subject_lower = subject.lower()

                    # Quick subject check
                    if any(s in subject_lower for s in skip_subjects):
                        continue

                    # Parse date
                    date_str = hdr_msg.get('Date', '')
                    try:
                        date_parsed = email_lib.utils.parsedate_to_datetime(date_str)
                        date_iso = date_parsed.isoformat()
                    except Exception:
                        date_iso = date_str

                    candidates.append({
                        'msg_id': msg_id,
                        'from_name': from_name,
                        'from_email': from_email_addr,
                        'subject': subject,
                        'date': date_iso,
                    })
                except Exception:
                    continue

            print(f'  ✅ Pass 1 done: {len(candidates)} candidates from {len(id_list)} emails')

            # ========== PASS 2: Fetch FULL BODY only for candidates ==========
            for cand in candidates:
                try:
                    status, msg_data = mail.fetch(cand['msg_id'], '(RFC822)')
                    if status != 'OK':
                        continue

                    raw_email = msg_data[0][1]
                    msg = email_lib.message_from_bytes(raw_email)

                    # Extract body text
                    body = self._extract_body(msg, max_chars=5000)

                    # Keyword matching on combined text
                    combined_text = (cand['subject'] + ' ' + body).lower()
                    for noise in ['christiania oppmerking as', 'christiania oppmerking',
                                  'post@christianiaoppmerking.no', 'knut@christianiaoppmerking.no',
                                  'www.christianiaoppmerking.no', 'christianiaoppmerking.no',
                                  'reset your password', 'glemt passord', 'velkommen som bruker',
                                  'doffin.no', 'mercell.com']:
                        combined_text = combined_text.replace(noise, '')

                    matched_keywords = [kw for kw in QUOTE_KEYWORDS if kw in combined_text]
                    if not matched_keywords:
                        continue

                    # Generate stable reference ID
                    stable_hash = hashlib.md5(f"{cand['from_email']}:{cand['subject']}:{cand['date']}".encode()).hexdigest().upper()
                    ref_id = stable_hash[:4]

                    emails.append({
                        'id': cand['msg_id'].decode(),
                        'ref': ref_id,
                        'subject': cand['subject'],
                        'from_name': cand['from_name'],
                        'from_email': cand['from_email'],
                        'date': cand['date'],
                        'body_preview': body[:500] + ('...' if len(body) > 500 else ''),
                        'full_body': body,
                        'is_quote_request': True,
                        'matched_keywords': matched_keywords,
                        'images': [],  # Skip image extraction for speed
                    })

                except Exception as e:
                    print(f'  Warning: Could not parse email {cand["msg_id"]}: {e}')
                    continue

            print(f'  🎯 Pass 2 done: {len(emails)} quote requests found')

            # Sort by date, newest first
            emails.sort(key=lambda x: x.get('date', ''), reverse=True)
            return emails

        finally:
            try:
                mail.logout()
            except Exception:
                pass

    def _decode_mime_header(self, header):
        """Decode a MIME-encoded header string."""
        if not header:
            return ''
        try:
            parts = decode_header(header)
        except Exception:
            return str(header)
        decoded = []
        for part, charset in parts:
            if isinstance(part, bytes):
                # Handle unknown/invalid charsets
                try:
                    decoded.append(part.decode(charset or 'utf-8', errors='replace'))
                except (LookupError, UnicodeDecodeError):
                    decoded.append(part.decode('latin-1', errors='replace'))
            else:
                decoded.append(part)
        return ' '.join(decoded)

    def _parse_from(self, from_raw):
        """Parse 'Name <email>' format into (name, email)."""
        from_decoded = self._decode_mime_header(from_raw)
        if '<' in from_decoded and '>' in from_decoded:
            name = from_decoded.split('<')[0].strip().strip('"')
            addr = from_decoded.split('<')[1].split('>')[0].strip()
            return name or addr, addr
        return from_decoded, from_decoded

    def _extract_images(self, msg, max_images=5, max_size_bytes=2*1024*1024):
        """Extract image attachments and inline images from email as base64 data URLs."""
        images = []
        IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'}

        if not msg.is_multipart():
            return images

        for part in msg.walk():
            if len(images) >= max_images:
                break

            content_type = part.get_content_type()
            if content_type not in IMAGE_TYPES:
                continue

            try:
                payload = part.get_payload(decode=True)
                if not payload or len(payload) > max_size_bytes:
                    continue

                # Get filename
                filename = part.get_filename()
                if filename:
                    filename = self._decode_mime_header(filename)
                else:
                    ext = content_type.split('/')[-1]
                    filename = f'bilde_{len(images) + 1}.{ext}'

                # Convert to base64 data URL
                b64 = base64.b64encode(payload).decode('ascii')
                data_url = f'data:{content_type};base64,{b64}'

                images.append({
                    'filename': filename,
                    'content_type': content_type,
                    'size': len(payload),
                    'data_url': data_url,
                })

            except Exception as e:
                print(f'  Warning: Could not extract image: {e}')
                continue

        return images

    def _extract_body(self, msg, max_chars=2000):
        """Extract plain text body from email message."""
        body = ''

        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get('Content-Disposition', ''))

                if content_type == 'text/plain' and 'attachment' not in content_disposition:
                    try:
                        charset = part.get_content_charset() or 'utf-8'
                        payload = part.get_payload(decode=True)
                        if payload:
                            try:
                                body = payload.decode(charset, errors='replace')
                            except (LookupError, UnicodeDecodeError):
                                body = payload.decode('latin-1', errors='replace')
                            break
                    except Exception:
                        continue

            # Fallback to HTML if no plain text found
            if not body:
                for part in msg.walk():
                    if part.get_content_type() == 'text/html':
                        try:
                            charset = part.get_content_charset() or 'utf-8'
                            payload = part.get_payload(decode=True)
                            if payload:
                                html = payload.decode(charset, errors='replace')
                                import re
                                from html import unescape
                                # Replace <br>, <p>, <div> with newlines to preserve structure
                                html = re.sub(r'<br\s*/?>', '\n', html, flags=re.IGNORECASE)
                                html = re.sub(r'</?(p|div|tr|li|h[1-6])[^>]*>', '\n', html, flags=re.IGNORECASE)
                                # Strip remaining tags
                                body = re.sub(r'<[^>]+>', ' ', html)
                                # Decode HTML entities (&amp; &nbsp; etc.)
                                body = unescape(body)
                                # Collapse multiple spaces but keep newlines
                                body = re.sub(r'[^\S\n]+', ' ', body)
                                body = re.sub(r'\n{3,}', '\n\n', body)
                                body = body.strip()
                                break
                        except Exception:
                            continue
        else:
            try:
                charset = msg.get_content_charset() or 'utf-8'
                payload = msg.get_payload(decode=True)
                if payload:
                    body = payload.decode(charset, errors='replace')
            except Exception:
                body = ''

        # Clean up and truncate
        body = body.strip()
        if len(body) > max_chars:
            body = body[:max_chars] + '...'
        return body

    def _send_json(self, data, status=200):
        """Send a JSON response."""
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._add_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _add_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def end_headers(self):
        # Set correct MIME types for JS modules
        if self.path.endswith('.js'):
            # Override content type for .js files
            pass
        super().end_headers()

    def guess_type(self, path):
        """Override to ensure .js files get correct MIME type."""
        if path.endswith('.js'):
            return 'application/javascript'
        if path.endswith('.mjs'):
            return 'application/javascript'
        return super().guess_type(path)


if __name__ == '__main__':
    print(f'🅿️  ParkTegn Server')
    print(f'   Serving static files from: {STATIC_DIR}')
    print(f'   API proxy: /api/* → {VEGVESEN_BASE}/')
    if MAIL_ACCOUNTS:
        accounts_str = ', '.join(MAIL_ACCOUNTS.keys())
        print(f'   📧 E-post: {len(MAIL_ACCOUNTS)} konto(er) konfigurert ({accounts_str})')
    else:
        print(f'   📧 E-post: Ingen kontoer konfigurert (sjekk .env)')
    print(f'   Open: http://localhost:{PORT}')
    print()

    server = http.server.HTTPServer(('', PORT), ProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
        server.server_close()
