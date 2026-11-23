import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from crawl_public_complaints import SOURCES, classify, parse_listing, select_records

class PublicListingTests(unittest.TestCase):
    def test_private_and_deleted_rows_are_never_indexed(self):
        public = '<tr><td class="tit"><a href="?nttId=123">공원 쓰레기 수거 요청</a></td><td class="writer">수집하면 안 되는 이름</td><td class="day">2026-11-20</td><td class="state">처리중</td></tr>'
        private = public.replace('<td class="tit">', '<td class="tit"><em class="icon-secret"></em>')
        html = '<table class="tbl"><tbody>' + public + private + '</tbody></table>'
        rows, skipped, count = parse_listing(html, SOURCES[0], SOURCES[0]['url'], '2026-11-23T12:00:00+09:00')
        self.assertEqual(count, 2); self.assertEqual(len(rows), 1)
        self.assertEqual(skipped['private_or_deleted'], 1)
        self.assertNotIn('수집하면 안 되는 이름', str(rows))

    def test_classification_does_not_republish_private_details_or_employment_items(self):
        self.assertEqual(classify('하천 산책로 침수 대책 요청')['topic'], 'safety')
        self.assertEqual(classify('포트홀 보수 요청')['topic'], 'road')
        self.assertEqual(classify('쓰레기 수거 요청')['topic'], 'living')
        self.assertIsNone(classify('산불감시원피복지급'))
        self.assertIsNone(classify('도로 민원 전화 010-1234-5678'))
        self.assertIsNone(classify('개인주택 침수 배상 요청'))

    def test_duplicates_and_non_https_links_do_not_enter_the_index(self):
        row = {'id': 'one', 'topic': 'road', 'title': '도로 파손', 'region': '춘천시', 'postedAt': '2026-11-20', 'sourceUrl': 'https://www.chuncheon.go.kr/a'}
        self.assertEqual(len(select_records([row, dict(row)], 12)), 1)
        html = '<table class="tbl"><tbody><tr><td class="tit"><a href="javascript:alert(1)">도로 파손</a></td><td class="day">2026-11-20</td></tr></tbody></table>'
        self.assertEqual(parse_listing(html, SOURCES[0], SOURCES[0]['url'], '2026-11-23T12:00:00+09:00')[0], [])

if __name__ == '__main__':
    unittest.main()
