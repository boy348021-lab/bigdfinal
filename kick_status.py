#!/usr/bin/env python3
"""Fetch Kick live status using curl_cffi to bypass Cloudflare."""
import json, sys

try:
    from curl_cffi import requests
    r = requests.get(
        "https://kick.com/api/v2/channels/bigdgamestv",
        impersonate="chrome",
        timeout=10,
    )
    if r.status_code != 200:
        raise Exception(f"HTTP {r.status_code}")
    data = r.json()
    livestream = data.get("livestream")
    live = bool(livestream and livestream.get("is_live") is not False)
    json.dump({"live": live, "ok": True}, sys.stdout)
except Exception as e:
    json.dump({"live": False, "ok": False, "error": str(e)}, sys.stdout)
