# CS2 HUD Matchless — Real-time Ban & Pick System

[中文](README.md)

A real-time Ban & Pick (map veto) HUD system for CS2 matches. Built with Flask-SocketIO for live multiplayer BP flow, supporting captain mode and team voting mode for BO1 / BO3 / BO5 formats.

> This project was developed with AI assistance.

---

## Features

- **Real-time Multiplayer BP**: Live vote-based map Ban & Pick between two teams
- **Two Modes**: Captain mode (single decision-maker) and Team mode (democratic voting)
- **Multi-map Voting**: In team mode, vote for multiple maps per round; Top-N by votes wins, ties broken randomly
- **BO1 / BO3 / BO5**: Three match formats; BO1 includes a special side-pick phase
- **HTTPS Support**: Optional SSL certificate configuration
- **CLI Admin Tool**: `bp_admin.py` for managing passwords, map pools, ports, and SSL settings
- **Web Admin Panel**: In-page Admin menu for settings, start, and reset
- **Esports HUD Style**: Tournament-grade UI with map thumbnails

---

## Quick Start

### Requirements

- Python 3.8+
- pip

### Installation

```bash
git clone https://github.com/yourname/cs2-hud-matchless.git
cd cs2-hud-matchless
pip install flask flask-socketio eventlet
```

### Run

```bash
python bp_server.py
```

A `bp_config.json` will be created on first run with default passwords printed to the console.
Open `http://localhost:5000` in your browser.

### Change Passwords & Settings

```bash
python bp_admin.py
```

---

## Configuration

All settings are stored in `bp_config.json` (auto-generated on first run). See `bp_config.example.json` for reference.

| Field | Description |
|---|---|
| `admin.password_hash` / `salt` | Admin password (SHA-256 + salt) |
| `teams.team1/team2` | Team names and passwords |
| `ssl.enable_https` | Enable HTTPS |
| `ssl.cert_dir` | SSL certificate directory (relative paths supported) |
| `ssl.cert_file` / `ssl.key_file` | Certificate and private key filenames |
| `ssl.domain` | Domain name (used for startup log display only) |
| `http_port` / `https_port` | HTTP / HTTPS port numbers |
| `map_pool` | Available map list |
| `bo` | Match format: 1 / 3 / 5 |
| `entry_mode` | Mode: `captain` or `team` |

---

## Map Images

The `res/` directory contains map thumbnails (PNG) named by map ID (e.g. `de_dust2.png`).

Available: de_ancient / de_anubis / de_dust2 / de_inferno / de_mirage / de_nuke / de_overpass / de_train / de_vertigo / de_cache

Replace these images with properly licensed assets for production use.

---

## Security Notes

- **Change default passwords immediately after first run**: defaults are `admin` / `team1` / `team2`. Use `python bp_admin.py`.
- The server binds to `0.0.0.0` by default, accessible from other devices on the same network.
- SSL certificates are required for HTTPS mode (e.g. from Let's Encrypt).
- `bp_config.json` contains password hashes and is excluded from Git via `.gitignore`.

---

## Dependencies

### Python (pip)

| Package | Purpose |
|---|---|
| [Flask](https://flask.palletsprojects.com/) | Web framework |
| [Flask-SocketIO](https://flask-socketio.readthedocs.io/) | WebSocket real-time communication |
| [eventlet](https://eventlet.net/) | Async networking engine (required for HTTPS) |

### Frontend CDN (no installation required)

| Library | Purpose |
|---|---|
| [Socket.IO Client v4.7.5](https://socket.io/) | Client-side WebSocket |
| [Font Awesome 6.5.1](https://fontawesome.com/) | Icons |
| [Google Fonts](https://fonts.google.com/) | Inter / Rajdhani typefaces |

---

## File Structure

```
cs2-hud-matchless/
├── bp_server.py              # Main server
├── bp_admin.py               # CLI config manager
├── bp_config.example.json    # Example config
├── bp_config.json            # Actual config (gitignored)
├── RealtimeBP.html           # Main HUD page
├── BanPick.html              # BanPick spectator view
├── BetweenMaps.html          # Inter-map transition
├── Halftime.html             # Halftime screen
├── PreMatch.html             # Pre-match screen
├── Results.html              # Results screen
├── TechBreak.html            # Technical timeout screen
├── res/                      # Map thumbnail images
├── README.md                 # Chinese documentation
├── README_en-US.md           # This file
└── LICENSE                   # MIT License
```

---

## AI Assistance Disclosure

This project was developed with the assistance of AI programming tools (OpenCode + DeepSeek-V4 Pro) for code generation, refactoring, and debugging. All AI-generated code was reviewed and tested by a human developer.

---

## License

[MIT](LICENSE)
