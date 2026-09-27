import asyncio
import json
import re
from bs4 import BeautifulSoup
from urllib.parse import urlencode
from urllib.request import urlopen, Request
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig


class PaperSearchConfig(FunctionBaseConfig, name="paper_tree_search"):
    pass


@register_function(config_type=PaperSearchConfig)
async def paper_search(config, builder):
    async def search(query: str) -> str:
        def request():
            arxiv_id = re.search(r"\b\d{4}\.\d{4,5}\b", query)
            if arxiv_id:
                url = "https://arxiv.org/abs/" + arxiv_id[0]
                with urlopen(url, timeout=25) as response:
                    page = BeautifulSoup(response.read(), "html.parser")
                return json.dumps([{"title": page.find("meta", attrs={"name": "citation_title"})["content"],
                                    "url": url, "content": page.select_one("blockquote.abstract").get_text(" ", strip=True)}])
            url = "https://api.openalex.org/works?" + urlencode({"search": query, "per-page": 8})
            try:
                with urlopen(Request(url, headers={"User-Agent": "PaperTree/0.1"}), timeout=20) as response:
                    items = json.load(response)["results"]
                return json.dumps([{"title": i["title"], "url": i.get("doi") or i["primary_location"]["landing_page_url"],
                                    "content": " ".join((i.get("abstract_inverted_index") or {}).keys())} for i in items])
            except (OSError, ValueError):
                url = "https://api.crossref.org/works?" + urlencode({"query.title": query, "rows": 8})
                with urlopen(url, timeout=20) as response:
                    items = json.load(response)["message"]["items"]
                return json.dumps([{"title": i.get("title", [""])[0], "url": i["URL"], "content": i.get("abstract", "")}
                                   for i in items if i.get("type") in ("journal-article", "proceedings-article", "posted-content")])
        return await asyncio.to_thread(request)
    yield FunctionInfo.from_fn(search, description="Search academic publications by concise keywords or exact arXiv ID; returns titles and source URLs.")
