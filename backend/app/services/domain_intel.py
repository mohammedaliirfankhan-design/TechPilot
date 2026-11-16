"""
Website classification for the Network Security page.

Answers one question per domain: is it risky, unnecessary for work,
background Windows/Microsoft traffic, or ordinary?

Sources
-------
Risky (exact host match only):
  - abuse.ch URLhaus host file  - hosts currently serving malware
  - OpenPhish community feed    - active phishing pages
Unnecessary (company policy: social media, video streaming,
gaming & gambling, adult content):
  - curated list of major platforms below (matches all subdomains)
  - StevenBlack/hosts category lists (MIT licence; exact host match)

Lists are downloaded in a background thread at start-up and refreshed
every 24 hours. If a download fails, the built-in lists still work and
the last good copy is kept.
"""

from __future__ import annotations

import logging
import threading
import time
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

REFRESH_SECONDS = 24 * 60 * 60
DOWNLOAD_TIMEOUT_SECONDS = 60
MAX_LIST_BYTES = 40 * 1024 * 1024

RISK_RISKY = "risky"
RISK_UNNECESSARY = "unnecessary"
RISK_OK = "ok"

CATEGORY_LABELS = {
    "malware": "Malware",
    "phishing": "Phishing",
    "adult": "Adult content",
    "gambling": "Gambling",
    "gaming": "Gaming",
    "social": "Social media",
    "streaming": "Video & streaming",
    "system": "Windows & Microsoft services",
    "ads": "Ads & trackers",
    "other": "Other",
}

# ---------------------------------------------------------
# Built-in lists (match the domain and all of its subdomains)
# ---------------------------------------------------------

_CURATED: dict[str, set[str]] = {
    "social": {
        "facebook.com", "fb.com", "fbcdn.net", "fbsbx.com", "messenger.com",
        "instagram.com", "cdninstagram.com", "threads.net",
        "twitter.com", "x.com", "twimg.com", "t.co",
        "tiktok.com", "tiktokcdn.com", "tiktokv.com", "tiktokcdn-eu.com",
        "snapchat.com", "sc-cdn.net", "reddit.com", "redd.it", "redditmedia.com",
        "redditstatic.com", "pinterest.com", "pinimg.com", "tumblr.com",
        "discord.com", "discordapp.com", "discord.gg", "discordapp.net",
        "telegram.org", "t.me", "sharechat.com", "mojapp.in", "quora.com",
    },
    "streaming": {
        "youtube.com", "youtu.be", "ytimg.com", "googlevideo.com",
        "youtube-nocookie.com", "youtubei.googleapis.com",
        "netflix.com", "nflxvideo.net", "nflximg.net", "nflxso.net", "nflxext.com",
        "primevideo.com", "aiv-cdn.net", "aiv-delivery.net",
        "hotstar.com", "jiohotstar.com", "jiocinema.com", "sonyliv.com", "zee5.com",
        "disneyplus.com", "hulu.com", "twitch.tv", "ttvnw.net", "jtvnw.net",
        "spotify.com", "scdn.co", "spotifycdn.com", "gaana.com", "jiosaavn.com",
        "wynk.in", "mxplayer.in", "crunchyroll.com", "dailymotion.com",
        "soundcloud.com", "sndcdn.com",
    },
    "gaming": {
        "steampowered.com", "steamcommunity.com", "steamstatic.com",
        "steamcontent.com", "epicgames.com", "epicgames.dev",
        "riotgames.com", "leagueoflegends.com", "playvalorant.com",
        "ea.com", "origin.com", "battle.net", "blizzard.com",
        "roblox.com", "rbxcdn.com", "minecraft.net", "chess.com", "lichess.org",
        "miniclip.com", "poki.com", "crazygames.com", "pubg.com", "krafton.com",
        "garena.com", "ubisoft.com", "rockstargames.com", "playstation.com",
        "nintendo.com", "gog.com", "itch.io", "friv.com",
    },
    "gambling": {
        "bet365.com", "betway.com", "1xbet.com", "parimatch.com", "stake.com",
        "dafabet.com", "10cric.com", "fun88.com", "betfair.com",
        "williamhill.com", "pokerstars.com", "dream11.com", "my11circle.com",
        "rummycircle.com", "jungleerummy.com", "pokerbaazi.com", "adda52.com",
        "winzogames.com", "mpl.live", "mplgaming.com", "a23.com",
    },
    "adult": {
        "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "redtube.com",
        "youporn.com", "onlyfans.com", "chaturbate.com", "stripchat.com",
        "spankbang.com", "eporner.com", "brazzers.com", "livejasmin.com",
    },
    "system": {
        "microsoft.com", "windows.com", "windowsupdate.com", "live.com",
        "office.com", "office.net", "office365.com", "microsoftonline.com",
        "msftauth.net", "msauth.net", "msftncsi.com", "msedge.net",
        "azure.com", "azureedge.net", "azurefd.net", "trafficmanager.net",
        "msn.com", "bing.com", "bing.net", "skype.com", "sharepoint.com",
        "onedrive.com", "msocsp.com", "digicert.com", "pki.goog",
        "gstatic.com", "googleapis.com", "msecnd.net", "windows.net",
        "xboxlive.com", "onrender.com",
    },
}

# Major ad and tracking networks (match all subdomains). Pages load
# these on their own; the person did not choose to visit them.
_ADS = {
    "doubleclick.net", "googlesyndication.com", "googleadservices.com",
    "google-analytics.com", "googletagmanager.com", "googletagservices.com",
    "adservice.google.com", "2mdn.net", "admob.com",
    "rubiconproject.com", "stickyadstv.com", "pubmatic.com", "openx.net",
    "adnxs.com", "criteo.com", "criteo.net", "taboola.com", "outbrain.com",
    "scorecardresearch.com", "amazon-adsystem.com", "adsrvr.org",
    "casalemedia.com", "moatads.com", "doubleverify.com", "adsafeprotected.com",
    "quantserve.com", "quantcount.com", "bidswitch.net", "smartadserver.com",
    "teads.tv", "yieldmo.com", "sharethrough.com", "33across.com",
    "lijit.com", "sovrn.com", "contextweb.com", "indexww.com",
    "media.net", "adform.net", "rlcdn.com", "demdex.net", "omtrdc.net",
    "everesttech.net", "bluekai.com", "krxd.net", "agkn.com",
    "hotjar.com", "clarity.ms", "mixpanel.com", "segment.io",
    "branch.io", "appsflyer.com", "adjust.com", "onesignal.com",
    "protechts.net", "perimeterx.net", "inmobi.com", "vdo.ai",
    "facebook.net", "connect.facebook.net", "ads-twitter.com",
    "analytics.tiktok.com", "ads.linkedin.com", "px.ads.linkedin.com",
}

# Work tools that some social lists include. Never flagged.
_WORK_ALLOWED = {
    "linkedin.com", "licdn.com", "whatsapp.com", "whatsapp.net",
    "slack.com", "zoom.us", "teams.microsoft.com",
}

# Shared platforms: never mark the whole host risky because one
# customer page on it appeared in a feed.
_NEVER_RISKY = {
    "google.com", "googleapis.com", "gstatic.com", "googleusercontent.com",
    "microsoft.com", "windows.com", "live.com", "office.com", "sharepoint.com",
    "github.com", "githubusercontent.com", "github.io", "gitlab.com",
    "amazonaws.com", "cloudfront.net", "azureedge.net", "windows.net",
    "apple.com", "icloud.com", "cloudflare.com", "dropbox.com",
    "onrender.com", "akamaihd.net", "akamaized.net", "fastly.net",
    "firebaseapp.com", "web.app", "weebly.com", "wixsite.com",
}

# Downloadable lists: (category, url, format)
_FEEDS = [
    ("malware", "https://urlhaus.abuse.ch/downloads/hostfile/", "hosts"),
    ("phishing", "https://openphish.com/feed.txt", "urls"),
    ("adult", "https://raw.githubusercontent.com/StevenBlack/hosts/master/extensions/porn/clefspeare13/hosts", "hosts"),
    ("adult", "https://raw.githubusercontent.com/StevenBlack/hosts/master/extensions/porn/sinfonietta/hosts", "hosts"),
    ("gambling", "https://raw.githubusercontent.com/StevenBlack/hosts/master/extensions/gambling/sinfonietta/hosts", "hosts"),
    ("social", "https://raw.githubusercontent.com/StevenBlack/hosts/master/extensions/social/sinfonietta/hosts", "hosts"),
    ("ads", "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts", "hosts"),
]

_lock = threading.Lock()
_exact: dict[str, dict[str, str]] = {}   # category -> {host: category}
_status: dict = {
    "loaded_at": None,
    "sources": {},
}
_started = False


# ---------------------------------------------------------
# Loading
# ---------------------------------------------------------

def _download(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "TechAIPILOT/1.0 (+network-security)"},
    )
    with urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response:
        data = response.read(MAX_LIST_BYTES + 1)
    if len(data) > MAX_LIST_BYTES:
        raise ValueError("list too large")
    return data.decode("utf-8", errors="replace")


def _parse(text: str, fmt: str) -> set[str]:
    hosts: set[str] = set()

    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        if fmt == "urls":
            host = urlparse(line).hostname or ""
        else:
            parts = line.split()
            host = parts[1] if len(parts) >= 2 else parts[0]

        host = host.strip().lower().rstrip(".")
        if host and "." in host and host not in ("localhost", "0.0.0.0"):
            hosts.add(host)

    return hosts


def refresh_lists() -> None:
    new_exact: dict[str, set[str]] = {}
    sources: dict = {}

    for category, url, fmt in _FEEDS:
        try:
            hosts = _parse(_download(url), fmt)
            new_exact.setdefault(category, set()).update(hosts)
            sources[url] = {"category": category, "count": len(hosts), "ok": True}
        except Exception as exc:  # keep going with the other lists
            logger.warning("Domain list download failed for %s: %s", url, exc)
            sources[url] = {"category": category, "count": 0, "ok": False}

    with _lock:
        for category, hosts in new_exact.items():
            if hosts:
                _exact[category] = hosts
        _status["loaded_at"] = datetime.now(timezone.utc).isoformat()
        _status["sources"] = sources

    logger.info(
        "Domain lists refreshed: %s",
        {c: len(h) for c, h in _exact.items()},
    )


def _refresh_loop() -> None:
    while True:
        try:
            refresh_lists()
        except Exception as exc:
            logger.warning("Domain list refresh failed: %s", exc)
        time.sleep(REFRESH_SECONDS)


def start_domain_intel() -> None:
    """Start the background list refresher once per process."""

    global _started

    with _lock:
        if _started:
            return
        _started = True

    threading.Thread(
        target=_refresh_loop,
        daemon=True,
        name="domain-intel",
    ).start()


def intel_status() -> dict:
    with _lock:
        return {
            "loaded_at": _status["loaded_at"],
            "sources": dict(_status["sources"]),
            "counts": {c: len(h) for c, h in _exact.items()},
        }


# ---------------------------------------------------------
# Classification
# ---------------------------------------------------------

def _parents(domain: str) -> list[str]:
    """www.a.example.com -> [www.a.example.com, a.example.com, example.com]"""
    labels = domain.split(".")
    return [".".join(labels[i:]) for i in range(len(labels) - 1)]


def _in_set(domain: str, names: set[str]) -> bool:
    return any(p in names for p in _parents(domain))


def classify(domain: str) -> tuple[str, str, str | None]:
    """
    Return (category, risk, reason) for a domain name.
    """

    start_domain_intel()

    domain = (domain or "").strip().lower().rstrip(".")
    bare = domain[4:] if domain.startswith("www.") else domain

    with _lock:
        exact = _exact

        # 1. Dangerous: exact host only, never shared platforms.
        if not _in_set(domain, _NEVER_RISKY):
            if domain in exact.get("malware", ()) or bare in exact.get("malware", ()):
                return "malware", RISK_RISKY, "Listed by abuse.ch URLhaus as serving malware"
            if domain in exact.get("phishing", ()) or bare in exact.get("phishing", ()):
                return "phishing", RISK_RISKY, "Listed by OpenPhish as an active phishing site"

        # 2. Work tools that some lists call social media (but their
        #    ad servers still count as ads).
        if _in_set(domain, _WORK_ALLOWED) and not _in_set(domain, _ADS):
            return "other", RISK_OK, None

        # 3. Known ad networks (before policy lists, which include some
        #    ad servers of the platforms they cover).
        if _in_set(domain, _ADS):
            return "ads", RISK_OK, None

        # 4. Company policy categories.
        for category in ("adult", "gambling", "gaming", "social", "streaming"):
            if _in_set(domain, _CURATED[category]) or domain in exact.get(category, ()) or bare in exact.get(category, ()):
                return category, RISK_UNNECESSARY, f"{CATEGORY_LABELS[category]} is not needed for work"

        # 5. Other ads and trackers loaded by pages (shown as a count only).
        if domain in exact.get("ads", ()):
            return "ads", RISK_OK, None

    # 6. Background Windows / Microsoft traffic.
    if _in_set(domain, _CURATED["system"]):
        return "system", RISK_OK, None

    return "other", RISK_OK, None
