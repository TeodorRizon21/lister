#!/usr/bin/env python3
"""Parse PDF extracts for Bal UAUIM → JSON for import script."""
from __future__ import annotations

import json
import re
from pathlib import Path

OUT = Path(__file__).resolve().parent / "_tmp-pdf-extract" / "uauim-participants.json"
INTERIOR = Path(__file__).resolve().parent / "_tmp-pdf-extract" / "interior.txt"
JF = Path(__file__).resolve().parent / "_tmp-pdf-extract" / "jf.txt"

# Domenii TLD explicite — nu înghit „Da”/„Nu” lipite (gmail.comDa).
EMAIL_DOMAIN = re.compile(
    r"@((?:[a-z0-9\-]+\.)+(?:com|ro|net|org|edu|io|co\.uk))",
    re.I,
)
LOCAL_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._%+-")

MASA_HDR = re.compile(r"^masa\s*(\d+)\b", re.I)
NUM_PREFIX = re.compile(r"^\d+\.\s*")
INVITAT_CLEAN = re.compile(
    r"\s*[-–—]?\s*(?:invitat(?:a)?|INVITAT(?:A)?)\s*[:\-]?\s*\(?.*?\)?\s*$",
    re.I,
)
ALLERGY_WORDS = re.compile(
    r"(?i)(?:"
    r"\bintoleran[tț][aă]?(?:\s*(?:la\s*)?(?:lactoz[aă]|gluten))?\b|"
    r"\balergie\b|"
    r"\bfara\s+(?:carne|porc|peste|branz|brânz)|"
    r"\bfără\s+(?:carne|porc|peste|branz|brânz)|"
    r"\bvegetarian(?:ă|a)?\b|"
    r"\bovo-?lacto-?vegetarian\b|"
    r"\blacto-?vegetarian\b|"
    r"\bpescatarian\b|"
    r"\bceliachie\b|"
    r"\b(?:porc|crustacee|alcool)\b"
    r").*$",
)


def clean_email(raw: str | None) -> str | None:
    if not raw:
        return None
    email = raw.strip().lower().replace(" ", "")
    email = email.replace("&", "@")
    email = re.sub(r"\.+$", "", email)
    email = email.replace("@gamil.com", "@gmail.com")
    email = re.sub(r"\.con$", ".com", email)
    email = re.sub(r"\.comm$", ".com", email)
    email = re.sub(r"@gmailcom$", "@gmail.com", email)
    if "@" in email:
        local, domain = email.split("@", 1)
        for prefix in (
            "lactoza",
            "gluten",
            "alcool",
            "vegetarian",
            "intolerantalactoza",
            "intolerantagluten",
        ):
            if local.startswith(prefix) and len(local) > len(prefix) + 2:
                local = local[len(prefix) :]
                break
        email = f"{local}@{domain}"
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", email):
        return None
    return email


def find_email_span(line: str) -> tuple[int, int, str] | None:
    """Returnează (start_local, end_domain, email_curat) sau None."""
    # & → @ pentru typo-uri tip osanmaria88&gmail.com
    work = re.sub(
        r"([a-z0-9._%+\-]+)&(gmail|yahoo|icloud|outlook|hotmail|ymail)\.",
        r"\1@\2.",
        line,
        flags=re.I,
    )
    # .con / .comm înainte de Da/Nu sau final
    work = re.sub(r"\.(con|comm)(?=[A-Za-z]|\s|$)", r".com", work, flags=re.I)
    dm = list(EMAIL_DOMAIN.finditer(work))
    if not dm:
        return None
    # ia ultimul domeniu valid pe linie
    d = dm[-1]
    at = d.start()
    j = at - 1
    while j >= 0 and work[j] in LOCAL_CHARS:
        j -= 1
    local = work[j + 1 : at]
    if not local:
        return None
    # NUMELIPITlocal@ — taie prefix majuscule (ANDREEAdobre… / GEORGEmoldo…)
    m_low = re.search(r"[a-z0-9]", local)
    name_extra = ""
    if m_low and m_low.start() > 0:
        prefix = local[: m_low.start()]
        # doar bloc ALL-CAPS lipit (ANDREEAdobre…), nu Title-Case (Andreea…)
        if len(prefix) >= 2 and prefix.isupper():
            name_extra = prefix
            local = local[m_low.start() :]
    raw_email = local + work[at : d.end()]
    email = clean_email(raw_email)
    if not email:
        return None
    start = j + 1 + len(name_extra)
    end = d.end()
    return start, end, email


def title_name(s: str) -> str:
    if not s or s == "—":
        return s
    parts = []
    for chunk in s.split(" "):
        if not chunk:
            continue
        if "-" in chunk:
            parts.append("-".join(p[:1].upper() + p[1:].lower() if p else "" for p in chunk.split("-")))
        else:
            parts.append(chunk[:1].upper() + chunk[1:].lower())
    return " ".join(parts)


def parse_menu(blob: str) -> str | None:
    s = blob.lower()
    s = s.replace("ă", "a").replace("â", "a").replace("î", "i").replace("ș", "s").replace("ț", "t")
    if not s.strip() or s.strip() in {"nu", "da", "-"}:
        return None
    if "vegetari" in s:
        return "vegetarian"
    if "porc" in s and ("vita" in s or "vita" in s):
        return "no_pork_no_beef"
    if "porc" in s or "fara carne de porc" in s or "fara porc" in s:
        return "no_pork"
    if any(
        k in s
        for k in (
            "lactoz",
            "gluten",
            "alerg",
            "pescat",
            "celiach",
            "branz",
            "fara",
            "rosii",
            "miere",
            "murat",
            "mustar",
            "crevet",
            "otet",
            "alcool",
            "crustace",
            "peste",
            "mazare",
            "ardei",
        )
    ):
        return "normal"  # special notes but not a menu enum — keep as normal; notes unused
    return None


def parse_bus(after: str, before_allergy: str) -> bool | None:
    blob = f"{after} {before_allergy}".lower()
    # Prefer tokens near end (transport column)
    tokens = re.findall(r"\b(da|nu)\b", blob, re.I)
    if not tokens:
        return None
    return tokens[0].lower() == "da"


def split_name(full: str) -> tuple[str, str]:
    full = re.sub(r"\s+", " ", full).strip(" -–—,;")
    full = INVITAT_CLEAN.sub("", full).strip(" -–—,;")
    full = re.sub(r"^(?:invitat(?:a)?|INVITAT(?:A)?)\s*[:\-]?\s*", "", full, flags=re.I)
    full = re.sub(r"^INVITAT\s+[^;]+;\s*", "", full, flags=re.I)
    # "LORENA DIACONU" / "MARIA TIRSA" — sometimes prenume first in JF notes
    parts = [p for p in full.replace("\u00a0", " ").split(" ") if p]
    if not parts:
        return ("", "")
    if len(parts) == 1:
        return (parts[0], "—")
    # Official RO style in JF: NUME PRENUME… → last, first
    return (parts[0], " ".join(parts[1:]))


def strip_allergy_from_name(name_blob: str) -> tuple[str, str]:
    """Return (name, allergy_text)."""
    m = ALLERGY_WORDS.search(name_blob)
    if m:
        return name_blob[: m.start()].strip(), name_blob[m.start() :].strip()
    return name_blob.strip(), ""


def extract_from_line(line: str, table: int | None) -> dict | None:
    line = line.replace("\u00a0", " ").strip()
    if not line or line.lower().startswith("nume prenume"):
        return None
    # Fix &gmail
    line = re.sub(r"([a-z0-9._%+\-]+)&(gmail|yahoo|icloud|outlook|hotmail)\.", r"\1@\2.", line, flags=re.I)

    span = find_email_span(line)
    if not span:
        # name-only row (no email)
        name_only = NUM_PREFIX.sub("", line)
        name_only = MASA_HDR.sub("", name_only).strip()
        if not name_only or len(name_only) < 3:
            return None
        if re.match(r"(?i)^(alergii|mail|autocar|transport)", name_only):
            return None
        name, allergy = strip_allergy_from_name(name_only)
        last, first = split_name(name)
        if not last:
            return None
        return {
            "tableNumber": table,
            "lastName": title_name(last),
            "firstName": title_name(first),
            "email": None,
            "menuType": parse_menu(allergy),
            "busReturn": False,
            "raw": line,
        }

    start, end, email = span
    before = line[:start]
    after = line[end:]
    before = NUM_PREFIX.sub("", before)
    before = MASA_HDR.sub("", before).strip()
    # dacă work a înlocuit .con→.com, end pe line poate fi scurt; after pe line e ok suficient
    name, allergy = strip_allergy_from_name(before)
    last, first = split_name(name)
    if not last:
        return None
    menu = parse_menu(f"{allergy} {after} {before}")
    bus = parse_bus(after, allergy)
    return {
        "tableNumber": table,
        "lastName": title_name(last),
        "firstName": title_name(first),
        "email": email,
        "menuType": menu,
        "busReturn": bool(bus) if bus is not None else False,
        "raw": line,
    }


def parse_zone(text: str, floor: str) -> list[dict]:
    people: list[dict] = []
    table: int | None = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        hdr = MASA_HDR.match(line)
        if hdr:
            table = int(hdr.group(1))
            # rest of line may contain first person
            rest = line[hdr.end() :].strip()
            # drop column headers glued on masa 1 interior
            rest = re.sub(r"(?i)^(alergii\s+)?mail(\s+autocar)?\s*", "", rest).strip()
            if rest:
                p = extract_from_line(rest, table)
                if p and p["lastName"]:
                    p["floor"] = floor
                    people.append(p)
            continue
        p = extract_from_line(line, table)
        if p and p["lastName"] and table is not None:
            p["floor"] = floor
            people.append(p)
    return people


FACULTY = [
    # masa 1 — conducerea
    ("VIP", 1, "Conducere", [
        "Vizitiu", "Rorya", "Depărățeanu", "Constantin", "Togan", "Dima",
        "Moldoveanu el", "Moldoveanu ea", "Subașu el", "Subașu ea", "Rotariu", "Băncilă",
    ]),
    # masa 2 — batalion
    ("VIP", 2, "Batalion", [
        "Gava", "Negoiță", "Rădulescu", "Almășanu", "Niculae", "Marcu", "Popa",
        "Neagoe Claudia", "Maghsoudi Teodora", "Clincescu", "Roman Andrada",
    ]),
    # masa 3 — facultatea A
    ("VIP", 3, "Facultatea A", [
        "Baciu Cătălin", "Budan Constantin", "Buliga Dan-Ilie", "Chiotan Corina",
        "Coțovanu Anabella", "Petcu Claudia", "Elisei Cojan", "Guță Octavian",
        "Eftimie Florin", "Stanciu Angelica", "Bogdan Gheorghe", "Zdrenghea Doru",
    ]),
    # masa 4 — facultatea A
    ("VIP", 4, "Facultatea A", [
        "Rotariu Adrian", "Șomoiag Pamfil", "Vedinaș Ioan", "Vedinaș Cristina",
        "Matache Liviu", "Mircioagă Răzvan", "Pulpea Bogdan", "Bucur Florina",
        "Haller Laviniu", "Bunduc Nicoleta", "Dîrloman Florin", "Cîrmaci Marius",
    ]),
    # masa 5 — facultatea B
    ("VIP", 5, "Facultatea B", [
        "Adochiei Ioana", "Adochiei Felix", "Boglis", "Cucu", "Fuiorea", "Grigorie",
        "Larco", "Mihaila", "Mustata", "Nacu", "Vidan", "Vatavu",
    ]),
    # masa 6 — combinat
    ("VIP", 6, "Combinat", [
        "Vilau", "Vinturis", "Herascu", "Bădoi", "Pașcan", "Preda",
    ]),
    # masa 7 — facultatea C
    ("VIP", 7, "Facultatea C", [
        "Aciobăniței", "Bica", "Coca", "Conchințoiu", "Cujbă", "Dobre",
        "Grumăzescu", "Marzavan", "Medvei", "Morogan", "Tiță", "Vlăduță",
    ]),
    # masa 8 — facultatea E
    ("VIP", 8, "Facultatea E", [
        "Ciotîrnae", "Enache", "Frunză", "Gorgoteanu", "Nicolaescu", "Nicula",
        "Rîncu", "Stănescu", "Nuțu", "Pantazi", "Păunescu",
    ]),
]


def faculty_name(raw: str) -> tuple[str, str]:
    raw = raw.strip()
    parts = raw.split()
    if len(parts) == 1:
        return parts[0], "—"
    # "Moldoveanu el" / "Subașu ea"
    if len(parts) == 2 and parts[1].lower() in {"el", "ea"}:
        return parts[0], parts[1]
    # Prefer last-name-first when 2+ tokens (official style)
    return parts[0], " ".join(parts[1:])


def main() -> None:
    interior = parse_zone(INTERIOR.read_text(encoding="utf-8"), "Interior")
    jf = parse_zone(JF.read_text(encoding="utf-8"), "Jocurile Foamei")

    faculty: list[dict] = []
    for floor, table, label, names in FACULTY:
        for n in names:
            last, first = faculty_name(n)
            faculty.append(
                {
                    "tableNumber": table,
                    "lastName": title_name(last),
                    "firstName": title_name(first),
                    "email": None,
                    "menuType": None,
                    "busReturn": False,
                    "floor": floor,
                    "groupLabel": label,
                    "teacher": True,
                    "raw": n,
                }
            )

    for p in interior + jf:
        p["teacher"] = False
        p["groupLabel"] = None

    data = {
        "interior": interior,
        "jocurileFoamei": jf,
        "faculty": faculty,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def stats(label: str, rows: list[dict]) -> None:
        with_email = sum(1 for r in rows if r.get("email"))
        print(f"{label}: {len(rows)} persoane, {with_email} cu email, {len(rows) - with_email} fără")

    stats("Interior", interior)
    stats("Jocurile Foamei", jf)
    stats("VIP/facultate", faculty)

    # flag suspicious
    for zone, rows in [("I", interior), ("JF", jf)]:
        for r in rows:
            if not r["email"] and not r.get("teacher"):
                print(f"  FĂRĂ EMAIL [{zone}] Masa {r['tableNumber']}: {r['lastName']} {r['firstName']} | {r.get('raw','')[:80]}")
            if r["email"] and (" " in r["lastName"] or len(r["firstName"]) > 40):
                print(f"  SUSPECT NUME [{zone}]: {r['lastName']} / {r['firstName']} <{r['email']}>")


if __name__ == "__main__":
    main()
