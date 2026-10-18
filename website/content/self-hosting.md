Onboarder has two modes, one config file, and three ways to edit it — the CLI wizard, CLI flags, and the web UI's Server drawer all write the same validated `config.json` (`~/.config/onboarder/config.json`, mode `0600`).

- **Local (default)** — binds to loopback only, asks for no credentials. The safe default.
- **Self-hosted** — a fresh setup binds `0.0.0.0` for direct LAN/VPS access. Any IP-literal address is accepted, while arbitrary Host names are not. Remote browsers get a themed access-key login page and exchange the key for a 7-day signed `HttpOnly`, `SameSite=Strict` session cookie; true localhost requests skip login. API clients can continue using `Authorization: Bearer <access-key>`. Rotate the key with `onboarder config key rotate`; the old key and every old browser session die on the next request.

```bash
onboarder setup                          # interactive wizard
onboarder setup --mode self-hosted \
  --domain map.example.com --https --start
onboarder config show                    # current settings (key masked)
onboarder config set host 0.0.0.0        # direct VPS/LAN access (domain optional)
onboarder config set port 4311           # move away from a busy port
onboarder config key rotate              # mint a new access key
onboarder start                          # foreground; Ctrl-C stops it
onboarder start background               # detached; keeps running after you close the terminal
onboarder logs                           # last 40 log lines  (-n <count>, -f to follow)
onboarder start startup install          # also start automatically at every login
onboarder start startup status           # is a login item installed, and is it live?
onboarder start startup remove           # take the login item back out
onboarder status                         # running PID, mode, uptime, stopped, or unmanaged port owner
onboarder stop                           # stop a PID-file-managed instance
onboarder restart                        # graceful stop, then start
onboarder tunnel cloudflare              # expose via a Cloudflare quick tunnel
onboarder tunnel tailscale               # expose privately over the tailnet
onboarder https check                    # DNS, ports 80/443, and Caddy readiness
onboarder https setup                    # write/validate Caddyfile, obtain TLS, reload/start Caddy
onboarder https status                   # domain, URL, Caddyfile, and Caddy state
onboarder doctor                         # config, access key, ports, DNS, TLS, and tunnels
```

### Running it in the background

`onboarder start` runs in the foreground on purpose: it is a normal command, and Ctrl-C stops it. When you want the server to outlive the terminal, use `start background`. It re-launches the same CLI as a detached process with its output going to `onboarder.log` beside your config, then **waits for the server to actually answer** `/api/health` before reporting success. A port conflict comes back as a failure with the log tail attached, not as a cheerful green light that dies a second later.

```bash
onboarder start background   # returns once it is serving
onboarder logs -f            # watch it, Ctrl-C to stop watching (not the server)
onboarder stop               # stop it
```

Log lines are column-aligned — a fixed-width local timestamp, a fixed-width level, then the message — so a wall of requests stays scannable:

```
16:09:38  INFO   GET /api/scan 200 (1.2s)
16:09:46  INFO   POST /api/auth/login 200 (2ms)
16:10:03  WARN   could not write the run record error=EACCES
```

### What gets logged (and what does not)

A single page load pulls ~90 ES modules, a stylesheet, and two vendored libraries. Logging each one buries every real event — a scan, a login, a 500 — under a hundred lines that describe nobody doing anything, repeated on every reload. So requests are classified:

| Request | Logged? |
|---|---|
| `GET /api/…` (a scan, a login, a settings save) | **yes** — this is a person doing something |
| Any `POST`/`PUT`/`DELETE` | **yes**, whatever the path |
| Any `4xx` or `5xx` | **yes** — a missing asset is a broken build, a 500 is a bug |
| `GET /api/health` (uptime poll) | no — it is not an event |
| `GET /app.js`, `/js/tree.js`, `/styles.css`, `/vendor/…` | **counted, not printed** |

Suppressed assets are not thrown away. Every 40 of them, one dim footnote is printed, so an idle terminal still says what it served rather than looking dead:

```
16:09:38           served 40 static files in 1.9s
```

`LOG_LEVEL=debug` (or `ONBOARDER_LOG_VERBOSE=1`) turns every request back on for when you are debugging the server rather than watching it. `ONBOARDER_LOG=json` switches the format to one JSON object per line for anything parsing the log.

### Terminal width

Every panel and log line is fitted to the terminal it is printed into, and a foreground `onboarder start` redraws its panel on `SIGWINCH` — resize the window and the border stays on screen instead of hanging off the edge. Long values are elided in the middle (the tail of a path is the part that identifies it), and below 52 columns the level column is dropped to make room for the message.

### Starting at login

`onboarder start startup install` registers Onboarder with whatever your OS uses for login items, and never asks for `sudo`:

| Platform | What it writes | How it loads |
|---|---|---|
| macOS | `~/Library/LaunchAgents/com.onboarder.server.plist` | `launchctl bootstrap gui/$UID` |
| Linux | `~/.config/systemd/user/onboarder.service` | `systemctl --user enable --now` |
| Windows | `%APPDATA%\...\Startup\Onboarder.cmd` | the file *is* the registration |

All three run the same `onboarder start --config <your config>`, so a login-started server is indistinguishable from a hand-started one — same config, same pid file, same `onboarder stop`. The generated unit uses `Restart=on-failure` (and launchd's `KeepAlive`/`SuccessfulExit=false`), so a crash is restarted but a deliberate `onboarder stop` stays stopped. `onboarder start startup remove` unloads and deletes it; a running server is left alone. On a platform with no known mechanism, the command says so instead of pretending.

A fresh self-hosted setup uses `0.0.0.0`, so a VPS is reachable at `http://<server-ip>:<port>` without a reverse proxy. The server accepts IPv4 and IPv6 IP literals, including a public address that reaches the host through provider NAT, but still rejects arbitrary DNS Host headers. A domain is optional for direct-IP access. If a domain is entered, setup asks whether to enable automatic HTTPS.

When a remote browser opens the URL, Onboarder shows its themed sign-in page. The access key is sent in a POST body—not in the URL—and the browser stores only the signed session cookie. Opening the same server through `http://localhost:<port>` on that machine skips the page. Caddy and tunnel connections remain authenticated because their public Host is not loopback.

For trusted HTTPS, DNS must already point the domain to the VPS and inbound TCP `80` and `443` must be allowed in both the cloud security group/NSG and the host firewall. On Ubuntu:

```bash
sudo apt update
sudo apt install caddy
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
onboarder https check
onboarder https setup
```

Onboarder writes a private `Caddyfile` beside `config.json`, validates it, and asks Caddy to obtain and renew the certificate. It never runs `sudo` or installs packages silently. Caddy proxies `https://map.example.com` to `http://127.0.0.1:4310`; Onboarder recognizes the connection as remote and shows the access-key login page. A bare public IP cannot use a normal trusted domain certificate.

If startup reports `EADDRINUSE`, run `onboarder status` first. If it identifies an Onboarder PID, use `onboarder stop` or `onboarder restart`; otherwise inspect the unrelated listener with `ss -ltnp` or `lsof -i :4310`, or choose another port. The error names these recovery commands instead of printing only the raw Node error.

Cloudflare quick tunnels and Tailscale remain supported. They terminate TLS and dial `127.0.0.1`, so an existing loopback setup is preserved. `ONBOARDER_CONFIG=/path/config.json` overrides the config location for tests and containers.

## A server that already hosts websites

Do not replace an existing Nginx or Caddy listener on ports 80/443. Configure a separate workspace hostname and proxy through your existing server, or use an SSH tunnel for private access. The public Onboarder marketing site and this documentation are static content, not a remote scanner.

For a private local session over SSH, keep Onboarder in local mode on the server and forward its loopback port:

```sh
ssh -L 4310:127.0.0.1:4310 user@your-server
```

Open http://localhost:4310 on your computer. Use a different local port if it is occupied. Remote local-path scans read the server's filesystem, not your computer's files.

For shared remote access, use self-hosted mode, a generated access key, HTTPS, and an explicitly configured domain. People who have access to that workspace can request scans against readable server paths and request analyzer operations; choose the service account and available repository files accordingly.
