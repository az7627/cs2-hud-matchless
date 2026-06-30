#!/usr/bin/env python3
"""
BP Admin — CLI tool to manage bp_config.json
Usage: python bp_admin.py
"""

import json
import hashlib
import os
import sys

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bp_config.json')

def load_config():
    with open(CONFIG_PATH, 'r') as f:
        return json.load(f)

def save_config(cfg):
    with open(CONFIG_PATH, 'w') as f:
        json.dump(cfg, f, indent=4)
    print("✓ Config saved.")

def make_salt():
    return os.urandom(16).hex()

def hash_password(password, salt):
    return hashlib.sha256((password + salt).encode()).hexdigest()

def set_password_section(label, section):
    print(f"\n── {label} ──")
    pwd = input("New password (leave empty to keep current): ").strip()
    if not pwd:
        print("  → Unchanged.")
        return section
    salt = make_salt()
    section['salt'] = salt
    section['password_hash'] = hash_password(pwd, salt)
    print("  → Password updated.")
    return section

def show_status(cfg):
    print("\n═══════════ Current Config ═══════════")
    print(f"  Admin password:   {'✔ set' if cfg['admin']['password_hash'] else '✘ NOT SET'}")
    print(f"  Team 1 [{cfg['teams']['team1']['name']}]: {'✔ set' if cfg['teams']['team1']['password_hash'] else '✘ NOT SET'}")
    print(f"  Team 2 [{cfg['teams']['team2']['name']}]: {'✔ set' if cfg['teams']['team2']['password_hash'] else '✘ NOT SET'}")
    print(f"  Map pool:         {len(cfg['map_pool'])} maps")
    print(f"  BO:               BO{cfg['bo']}")
    print(f"  Entry mode:       {cfg['entry_mode']}")
    print(f"  Team 1 name:      {cfg['teams']['team1']['name']}")
    print(f"  Team 2 name:      {cfg['teams']['team2']['name']}")
    print("════════════════════════════════════\n")

def main():
    if not os.path.exists(CONFIG_PATH):
        print(f"✘ Config not found at {CONFIG_PATH}")
        sys.exit(1)

    cfg = load_config()
    show_status(cfg)

    print("Options:")
    print("  1  Change admin password")
    print("  2  Change Team 1 name & password")
    print("  3  Change Team 2 name & password")
    print("  4  Set map pool (comma-separated IDs)")
    print("  5  Set BO (1 / 3 / 5)")
    print("  6  Set entry mode (captain / team)")
    print("  7  Show full JSON")
    print("  0  Exit")
    print()

    while True:
        try:
            ch = input("Choice: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if ch == '1':
            cfg['admin'] = set_password_section('Admin Password', cfg['admin'])
            save_config(cfg)

        elif ch == '2':
            name = input(f"Team 1 name [{cfg['teams']['team1']['name']}]: ").strip()
            if name:
                cfg['teams']['team1']['name'] = name
            cfg['teams']['team1'] = set_password_section(f'Team 1 ({cfg["teams"]["team1"]["name"]}) Password', cfg['teams']['team1'])
            save_config(cfg)

        elif ch == '3':
            name = input(f"Team 2 name [{cfg['teams']['team2']['name']}]: ").strip()
            if name:
                cfg['teams']['team2']['name'] = name
            cfg['teams']['team2'] = set_password_section(f'Team 2 ({cfg["teams"]["team2"]["name"]}) Password', cfg['teams']['team2'])
            save_config(cfg)

        elif ch == '4':
            current = ', '.join(cfg['map_pool'])
            val = input(f"Map IDs (comma-separated, current: {current}): ").strip()
            if val:
                maps = [m.strip() for m in val.split(',') if m.strip()]
                if maps:
                    cfg['map_pool'] = maps
                    print(f"  → Map pool set to {len(maps)} maps.")
                    save_config(cfg)
                else:
                    print("  ✘ No valid map IDs entered.")

        elif ch == '5':
            val = input("BO (1 / 3 / 5): ").strip()
            if val in ('1', '3', '5'):
                cfg['bo'] = int(val)
                print(f"  → BO{val}")
                save_config(cfg)
            else:
                print("  ✘ Must be 1, 3, or 5.")

        elif ch == '6':
            val = input("Entry mode (captain / team): ").strip().lower()
            if val in ('captain', 'team'):
                cfg['entry_mode'] = val
                print(f"  → Entry mode: {val}")
                save_config(cfg)
            else:
                print("  ✘ Must be 'captain' or 'team'.")

        elif ch == '7':
            print(json.dumps(cfg, indent=4))

        elif ch == '0':
            break

        else:
            print("  ✘ Unknown option.")

if __name__ == '__main__':
    main()
