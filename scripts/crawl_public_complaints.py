"""Index public Gangwon complaint titles. Never downloads bodies or attachments."""

import argparse
import csv
import hashlib
import json
import re
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/web/data/public-complaints.json"
USER_AGENT = "ManitoPublicIndex/1.0 (public board title index; low rate)"
SEOUL = timezone(timedelta(hours=9))
SOURCES = [
    {"id": "chuncheon", "name": "춘천시 · 춘천시에 바란다", "region": "춘천시", "url": "https://www.chuncheon.go.kr/mayor/civil-complaint/", "pageKey": "pageIndex"},
    {"id": "gangneung-council", "name": "강릉시의회 · 의회에바란다", "region": "강릉시", "url": "https://www.gncl.go.kr/kr/bbs?bbs_id=request", "pageKey": "page"},
]
RULES = {
    "safety": ("침수", "산사태", "산불", "화재", "붕괴", "낙석", "추락", "결빙", "소화전", "재난", "낙하", "안전", "방범", "급경사지", "난간", "울타리", "펜스", "비상벨", "CCTV", "맨홀", "미끄럼"),
    "road": ("도로", "차선", "횡단", "보행", "인도", "포트홀", "신호등", "과속", "교통", "주정차", "불법주차", "보도", "가로등", "점자", "교차로", "지방도", "이륜차", "방지턱", "진입로", "우회전", "좌회전", "경사로", "보안등"),
    "living": ("쓰레기", "악취", "소음", "하수", "오하수", "오수", "청소", "공원", "방역", "날벌레", "화장실", "가로수", "잡초", "폐기물", "분리수거", "수거", "상수도", "버스", "시설물", "공공시설", "수목", "은행나무", "낙엽", "주차", "산책로"),
}
SENSITIVE = re.compile(r"사기|횡령|비리|갑질|체불|징계|학대|고발|살인|자살|의혹|소송|감사.{0,20}요청|보상금|배상|분양전환|불륜|욕설|삭제 게시물|피복|수당|봉안당|추모|개인주택|행정처분|법.{0,15}위반|실태\s*조사|억지행정")
PERSONAL = re.compile(r"(?:\d[ -]?){9,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\d{1,4}동\s*\d{1,4}호")


def clean(value):
    return re.sub(r"\s+", " ", value).strip()


def classify(title):
    if SENSITIVE.search(title) or PERSONAL.search(title):
        return None
    if re.search(r"(?:버스|교통).*(?:정액권|환급|시간표|노선|배차)", title):
        return {"topic": "living", "matchedKeyword": "대중교통 이용 불편", "classificationMethod": "title_keyword"}
    for topic, keywords in RULES.items():
        for word in keywords:
            if word in title:
                return {"topic": topic, "matchedKeyword": word, "classificationMethod": "title_keyword"}
    return None


def page_url(source, number):
    url = urlsplit(source["url"])
    query = parse_qs(url.query)
    query[source["pageKey"]] = [str(number)]
    return urlunsplit((url.scheme, url.netloc, url.path, urlencode(query, doseq=True), ""))


def canonical_post(source, href):
    url = urlsplit(urljoin(source["url"], href))
    if url.scheme != "https" or url.netloc != urlsplit(source["url"]).netloc:
        return None
    query = parse_qs(url.query)
    if source["id"] == "chuncheon":
        ident = query.get("nttId", [""])[0]
        if not ident.isdigit():
            return None
        params = {"bbsId": "BBSMSTR_000000000143", "nttId": ident, "flag": "view"}
    else:
        ident = query.get("uid", [""])[0]
        if not re.fullmatch(r"[A-Fa-f0-9]{32}", ident):
            return None
        params = {"bbs_id": "request", "reform": "view", "uid": ident}
    return urlunsplit((url.scheme, url.netloc, urlsplit(source["url"]).path, urlencode(params), ""))


def parse_listing(html, source, listing_url, fetched_at):
    soup = BeautifulSoup(html, "html.parser", from_encoding="utf-8" if isinstance(html, bytes) else None)
    selector = "table.tbl tbody tr" if source["id"] == "chuncheon" else "table.board_list tbody tr"
    rows = soup.select(selector)
    if not rows:
        raise ValueError(f"Expected complaint rows missing: {listing_url}")
    records, skipped = [], Counter()
    for row in rows:
        cell = row.select_one(".tit" if source["id"] == "chuncheon" else ".con")
        if cell is None:
            skipped["invalid"] += 1
            continue
        markers = clean(cell.get_text(" ", strip=True))
        if row.select_one(".icon-secret,.del,.del_reason") or re.search(r"비밀|비공개|삭제", markers):
            skipped["private_or_deleted"] += 1
            continue
        link = cell.select_one("a[href]")
        if not link:
            skipped["no_public_link"] += 1
            continue
        # Badges and writer columns are deliberately never serialized.
        for badge in link.select(".label,.m"):
            badge.decompose()
        title = clean(link.get_text(" ", strip=True))
        if title.startswith(("[답글]", "RE:", "Re:")):
            skipped["reply"] += 1
            continue
        match = classify(title)
        if not match or len(title) > 150:
            skipped["unrelated_or_sensitive"] += 1
            continue
        if source["id"] == "chuncheon":
            day, state = row.select_one(".day"), row.select_one(".state")
        else:
            cells = row.find_all("td", recursive=False)
            day, state = (cells[4], cells[2]) if len(cells) >= 5 else (None, None)
        date = re.search(r"\d{4}-\d{2}-\d{2}", day.get_text() if day else "")
        source_url = canonical_post(source, link["href"])
        if not date or not source_url:
            skipped["invalid"] += 1
            continue
        posted_at = date.group()
        if posted_at > fetched_at[:10] or posted_at < "2025-01-01":
            skipped["outside_date_range"] += 1
            continue
        try:
            datetime.strptime(posted_at, "%Y-%m-%d")
        except ValueError:
            skipped["invalid"] += 1
            continue
        status = re.sub(r"^처리상태\s*:\s*", "", clean(state.get_text(" ", strip=True))) if state else ""
        records.append({
            "id": f"public-{source['id']}-{hashlib.sha256(source_url.encode()).hexdigest()[:16]}",
            **match, "title": title, "region": source["region"], "postedAt": posted_at,
            "sourceStatus": status or "상태 미표시", "sourceName": source["name"],
            "sourceUrl": source_url, "sourceBoardUrl": source["url"],
            "listingUrl": listing_url, "collectedAt": fetched_at,
        })
    return records, skipped, len(rows)


class PublicClient:
    def __init__(self, interval=1.0):
        self.interval = max(1.0, interval)
        self.last_request = 0
        self.robots = {}

    def read(self, url):
        time.sleep(max(0, self.interval - (time.monotonic() - self.last_request)))
        self.last_request = time.monotonic()
        with urlopen(Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,text/plain"}), timeout=20) as response:
            if urlsplit(response.url).netloc != urlsplit(url).netloc:
                raise ValueError("Unexpected cross-site redirect")
            raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise ValueError("Response too large")
            return raw

    def allowed(self, url):
        origin = f"{urlsplit(url).scheme}://{urlsplit(url).netloc}"
        if origin not in self.robots:
            parser = RobotFileParser()
            try:
                parser.parse(self.read(origin + "/robots.txt").decode("utf-8-sig").splitlines())
                self.robots[origin] = (parser, "checked")
            except HTTPError as error:
                if error.code not in (404, 410):
                    raise
                self.robots[origin] = (None, "not_found")
        parser, _ = self.robots[origin]
        return parser is None or parser.can_fetch(USER_AGENT, url)

    def get(self, url):
        if not self.allowed(url):
            raise ValueError(f"robots.txt blocks {url}")
        return self.read(url)


def select_records(records, per_topic):
    ordered = sorted(records, key=lambda item: (item["postedAt"], item["id"]), reverse=True)
    seen_urls, seen_titles, counts, selected = set(), set(), Counter(), []
    # Round-robin sources so the index does not silently represent just one city.
    for topic in ("living", "road", "safety"):
        buckets = [[r for r in ordered if r["topic"] == topic and r["region"] == source["region"]] for source in SOURCES]
        while any(buckets) and counts[topic] < per_topic:
            for bucket in buckets:
                while bucket:
                    row = bucket.pop(0)
                    fingerprint = (row["region"], re.sub(r"\W", "", row["title"]).casefold())
                    if row["sourceUrl"] not in seen_urls and fingerprint not in seen_titles:
                        selected.append(row); counts[topic] += 1
                        seen_urls.add(row["sourceUrl"]); seen_titles.add(fingerprint)
                        break
                if counts[topic] >= per_topic:
                    break
    return sorted(selected, key=lambda row: (row["postedAt"], row["id"]), reverse=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pages", type=int, default=25)
    parser.add_argument("--council-pages", type=int, default=8)
    parser.add_argument("--per-topic", type=int, default=12)
    args = parser.parse_args()
    if not 1 <= args.pages <= 40 or not 1 <= args.council_pages <= 15 or not 1 <= args.per_topic <= 30:
        parser.error("Use bounded page/topic counts")
    collected_at = datetime.now(SEOUL).isoformat(timespec="seconds")
    client, records, audit = PublicClient(), [], []
    for source in SOURCES:
        pages = args.pages if source["id"] == "chuncheon" else args.council_pages
        scanned, skipped, seen_pages = 0, Counter(), set()
        for number in range(1, pages + 1):
            url = page_url(source, number)
            raw = client.get(url)
            batch, reasons, count = parse_listing(raw, source, url, collected_at)
            signature = hashlib.sha256(raw).hexdigest()
            if signature in seen_pages:
                raise ValueError("Pagination returned duplicate HTML; refusing partial overwrite")
            seen_pages.add(signature)
            records.extend(batch); skipped.update(reasons); scanned += count
            if number % 5 == 0:
                print(f"{source['id']}: {number}/{pages} pages", flush=True)
        audit.append({**{k: source[k] for k in ("id", "name", "region", "url")}, "pagesFetched": pages, "rowsScanned": scanned, "skipped": dict(skipped), "robots": client.robots[f"https://{urlsplit(source['url']).netloc}"][1]})
    selected = select_records(records, args.per_topic)
    counts = Counter(record["topic"] for record in selected)
    if any(counts[topic] < 3 for topic in RULES):
        raise ValueError(f"Insufficient verified public titles: {dict(counts)}; existing dataset retained")
    payload = {"version": 1, "collectedAt": collected_at, "coverage": sorted({r["region"] for r in selected}), "collectionMode": "public_listing_metadata", "sources": audit, "records": selected}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    api_output = ROOT / "services/api/src/public-complaints.json"
    api_output.parent.mkdir(parents=True, exist_ok=True)
    api_temporary = api_output.with_suffix(".json.tmp")
    api_temporary.write_bytes(OUTPUT.read_bytes())
    api_temporary.replace(api_output)
    csv_file = ROOT / "docs/data/gangwon-public-complaints.csv"
    csv_file.parent.mkdir(parents=True, exist_ok=True)
    fields = ["topic", "title", "region", "postedAt", "sourceStatus", "sourceName", "sourceUrl", "collectedAt"]
    with csv_file.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader(); writer.writerows(selected)
    print(json.dumps({"records": len(selected), "counts": dict(counts), "coverage": payload["coverage"], "path": str(OUTPUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
