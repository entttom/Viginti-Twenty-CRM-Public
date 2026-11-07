#!/usr/bin/env python3
"""Validate App Store metadata in docs/appstore/.

Run from anywhere:

    python3 -I docs/appstore/validate.py            # validate metadata/ + subscriptions/
    python3 -I docs/appstore/validate.py --current  # also check the live values in current/

Checks
- metadata/<locale>.json: required fields, App Store length limits (characters;
  keywords in UTF-8 bytes), name contains "Viginti", keyword formatting
  (comma-separated, no spaces around commas, no empty entries), no duplicate
  keywords or keyword words, no keyword word already in the name or subtitle
  (case-, accent- and simple-plural-insensitive), no banned words ("app",
  "iPhone", ...) and no competitor trademarks, Terms of Use and Privacy Policy
  links in the description.
- subscriptions/<locale>.json: group display name <= 30, subscription display
  name <= 30, description <= 45, every product present in every locale.
- Every expected locale exists in both folders.

Exit code 0 when everything passes, 1 otherwise. Standard library only.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent

LOCALES = ["en-US", "de-DE", "fr-FR", "es-ES", "it", "nl-NL", "pt-BR"]

LIMITS = {  # field -> (max, unit)
    "name": (30, "chars"),
    "subtitle": (30, "chars"),
    "keywords": (100, "bytes"),
    "description": (4000, "chars"),
    "promotionalText": (170, "chars"),
    "whatsNew": (4000, "chars"),
}
REQUIRED_NONEMPTY = ["name", "subtitle", "keywords", "description", "whatsNew"]

SUB_LIMITS = {"groupName": 30, "name": 30, "description": 45}
PRODUCT_IDS = {
    "org.entner.twenty.Twenty.pro.monatlich",
    "org.entner.twenty.Twenty.pro.yearly",
}

TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
PRIVACY_URL = "https://www.drentner.at/privacy-policy/"

# Words Apple says not to waste keyword space on / that are not allowed.
BANNED_WORDS = {"app", "apps", "application", "iphone", "ipad", "ios", "ipados",
                "apple", "macos"}
# Unambiguous competitor / third-party brand names.
TRADEMARKS = {"salesforce", "hubspot", "pipedrive", "zoho", "attio", "freshsales",
              "freshworks", "sugarcrm", "suitecrm", "espocrm", "vtiger", "odoo",
              "insightly", "bitrix24", "airtable", "notion", "keap", "monday.com",
              "dynamics365"}

PLURAL_SUFFIXES = ("s", "es", "e", "en", "n", "i")


def fold(word):
    """Lowercase and strip accents so 'Tâches' == 'taches'."""
    decomposed = unicodedata.normalize("NFKD", word.casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def words(text):
    return [fold(w) for w in re.findall(r"\w+", text, flags=re.UNICODE)]


def same_word(a, b):
    """Equal, or one is a simple plural/inflection of the other."""
    if a == b:
        return True
    if min(len(a), len(b)) < 3:
        return False
    short, long_ = sorted((a, b), key=len)
    return any(long_ == short + suffix for suffix in PLURAL_SUFFIXES)


def check_keywords(keywords, name, subtitle):
    errors = []
    if keywords != keywords.strip():
        errors.append("keywords: leading/trailing whitespace")
    if re.search(r"\s,|,\s", keywords):
        errors.append("keywords: space before/after a comma")
    entries = keywords.split(",")
    if any(not e.strip() for e in entries):
        errors.append("keywords: empty entry (double or trailing comma)")

    seen_entries = set()
    for e in entries:
        f = fold(e.strip())
        if f in seen_entries:
            errors.append(f"keywords: duplicate entry '{e}'")
        seen_entries.add(f)

    seen_words = {}  # word -> entry it first appeared in
    for e in entries:
        for w in words(e):
            for prev, prev_entry in seen_words.items():
                if prev_entry != e and same_word(w, prev):
                    errors.append(f"keywords: word '{w}' in '{e}' repeats '{prev}' from '{prev_entry}'")
            seen_words.setdefault(w, e)

    title_words = set(words(name)) | set(words(subtitle))
    for e in entries:
        for w in words(e):
            hits = sorted(t for t in title_words if same_word(w, t))
            if hits:
                errors.append(f"keywords: '{e}' repeats name/subtitle word {hits}")
            if w in BANNED_WORDS:
                errors.append(f"keywords: banned word '{w}' in '{e}'")
        if fold(e.strip()) in TRADEMARKS or any(w in TRADEMARKS for w in words(e)):
            errors.append(f"keywords: competitor trademark '{e}'")
    return errors


def check_lengths(data, fields):
    errors, sizes = [], {}
    for field in fields:
        value = data.get(field)
        if value is None:
            continue
        limit, unit = LIMITS[field]
        size = len(value.encode("utf-8")) if unit == "bytes" else len(value)
        sizes[field] = f"{size}/{limit}"
        if size > limit:
            errors.append(f"{field}: {size} {unit} > {limit}")
    return errors, sizes


def validate_metadata(locale):
    path = ROOT / "metadata" / f"{locale}.json"
    if not path.exists():
        return [f"missing file {path.relative_to(ROOT)}"], {}
    data = json.loads(path.read_text(encoding="utf-8"))
    errors = []
    if data.get("locale", locale) != locale:
        errors.append(f"locale field '{data.get('locale')}' does not match file name")
    for field in LIMITS:
        if not isinstance(data.get(field), str):
            errors.append(f"{field}: missing or not a string")
    for field in REQUIRED_NONEMPTY:
        if isinstance(data.get(field), str) and not data[field].strip():
            errors.append(f"{field}: empty")
    if errors:
        return errors, {}

    length_errors, sizes = check_lengths(data, LIMITS)
    errors += length_errors
    if "viginti" not in fold(data["name"]):
        errors.append("name: must contain 'Viginti'")
    errors += check_keywords(data["keywords"], data["name"], data["subtitle"])
    for url, label in ((TERMS_URL, "Terms of Use"), (PRIVACY_URL, "Privacy Policy")):
        if url not in data["description"]:
            errors.append(f"description: {label} link missing")
    if "14" not in data["description"]:
        errors.append("description: free-trial length (14 days) not mentioned")
    return errors, sizes


def validate_subscriptions(locale):
    path = ROOT / "subscriptions" / f"{locale}.json"
    if not path.exists():
        return [f"missing file {path.relative_to(ROOT)}"]
    data = json.loads(path.read_text(encoding="utf-8"))
    errors = []
    group_name = (data.get("group") or {}).get("name") or ""
    if not group_name.strip():
        errors.append("group.name: empty")
    elif len(group_name) > SUB_LIMITS["groupName"]:
        errors.append(f"group.name: {len(group_name)} chars > {SUB_LIMITS['groupName']}")
    found = set()
    for sub in data.get("subscriptions", []):
        pid = sub.get("productId")
        found.add(pid)
        for field in ("name", "description"):
            value = sub.get(field) or ""
            if not value.strip():
                errors.append(f"{pid} {field}: empty")
            elif len(value) > SUB_LIMITS[field]:
                errors.append(f"{pid} {field}: {len(value)} chars > {SUB_LIMITS[field]}")
    for missing in sorted(PRODUCT_IDS - found):
        errors.append(f"subscription {missing} missing")
    for extra in sorted(found - PRODUCT_IDS):
        errors.append(f"unknown subscription {extra}")
    return errors


def report_current():
    """Informational: apply the same rules to the live values in current/."""
    print("\nCurrent App Store Connect values (current/):")
    info = json.loads((ROOT / "current" / "app-info-localizations.json").read_text(encoding="utf-8"))
    ver = json.loads((ROOT / "current" / "version-1.1-localizations.json").read_text(encoding="utf-8"))
    titles = {x["attributes"]["locale"]: x["attributes"] for x in info["data"]}
    for item in ver["data"]:
        attrs = item["attributes"]
        locale = attrs["locale"]
        title = titles.get(locale, {})
        data = {**attrs, "name": title.get("name", ""), "subtitle": title.get("subtitle", "")}
        errors, sizes = check_lengths(data, LIMITS)
        errors += check_keywords(attrs.get("keywords") or "", data["name"], data["subtitle"])
        status = "OK" if not errors else f"{len(errors)} issue(s)"
        print(f"  {locale}: {status}  " + "  ".join(f"{k}={v}" for k, v in sizes.items()))
        for e in errors:
            print(f"    - {e}")


def main():
    failed = False
    print("Metadata (metadata/<locale>.json):")
    for locale in LOCALES:
        errors, sizes = validate_metadata(locale)
        status = "OK" if not errors else "FAIL"
        print(f"  {locale:6} {status:4}  " + "  ".join(f"{k}={v}" for k, v in sizes.items()))
        for e in errors:
            print(f"    - {e}")
        failed |= bool(errors)

    print("\nSubscriptions (subscriptions/<locale>.json):")
    for locale in LOCALES:
        errors = validate_subscriptions(locale)
        print(f"  {locale:6} {'OK' if not errors else 'FAIL'}")
        for e in errors:
            print(f"    - {e}")
        failed |= bool(errors)

    for folder in ("metadata", "subscriptions"):
        extra = sorted(p.stem for p in (ROOT / folder).glob("*.json") if p.stem not in LOCALES)
        if extra:
            print(f"\nUnexpected locale files in {folder}/: {extra}")
            failed = True

    if "--current" in sys.argv[1:]:
        report_current()

    print("\nRESULT:", "FAIL" if failed else "PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
