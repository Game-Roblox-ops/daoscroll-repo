
const mangayomiSources = [{
  "name": "DaoScroll",
  "lang": "en",
  "baseUrl": "https://daoscroll.com",
  "apiUrl": "",
  "iconUrl": "https://daoscroll.com/favicon.ico",
  "typeSource": "single",
  "itemType": 2,
  "version": "0.0.1",
  "pkgPath": "novel/src/en/daoscroll.js"
}];

// ---- SITE CONFIG: adjust these after inspecting daoscroll.com ----
const CFG = {
  popularPath: "/novels?page={page}",          // browse/popular listing
  latestPath: "/latest?page={page}",           // latest updates listing
  searchPath: "/search?q={q}&page={page}",     // search results
  bookLinkContains: "/novel/",                 // substring in a novel's URL
  chapterLinkContains: "/read/",               // chapter URLs look like /read/chapter-481/
  titleSel: "h1",
  descSel: "meta[property='og:description']",
  coverSel: "meta[property='og:image']",
  chapterContentSel: "#chapter-content, .chapter-content, .entry-content, article"
};

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  get base() { return "https://daoscroll.com"; }

  get headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
      "Referer": this.base + "/"
    };
  }

  async getDoc(url) {
    const res = await this.client.get(url, this.headers);
    return new Document(res.body);
  }

  abs(u) {
    if (!u) return "";
    if (u.startsWith("//")) return "https:" + u;
    if (u.startsWith("/")) return this.base + u;
    return u;
  }

  parseList(doc) {
    const seen = {};
    const list = [];
    for (const a of doc.select(`a[href*='${CFG.bookLinkContains}']`)) {
      const img = a.selectFirst("img");
      if (!img) continue;
      const link = this.abs(a.attr("href").split("?")[0]);
      if (seen[link]) continue;
      const name = (a.attr("title") || img.attr("alt") || a.text || "").trim();
      if (!name) continue;
      seen[link] = true;
      const imageUrl = this.abs(
        img.attr("data-src") || img.attr("data-original") || img.attr("src")
      );
      list.push({ name, link, imageUrl });
    }
    return list;
  }

  fill(path, page, q) {
    return this.base + path.replace("{page}", page).replace("{q}", encodeURIComponent(q || ""));
  }

  async getPopular(page) {
    const list = this.parseList(await this.getDoc(this.fill(CFG.popularPath, page)));
    return { list, hasNextPage: list.length > 0 };
  }

  async getLatestUpdates(page) {
    const list = this.parseList(await this.getDoc(this.fill(CFG.latestPath, page)));
    return { list, hasNextPage: list.length > 0 };
  }

  async search(query, page, filters) {
    const list = this.parseList(await this.getDoc(this.fill(CFG.searchPath, page, query)));
    return { list, hasNextPage: list.length > 0 };
  }

  async getDetail(url) {
    const doc = await this.getDoc(url);
    const name = (doc.selectFirst(CFG.titleSel)?.text || "").trim();
    const imageUrl = this.abs(doc.selectFirst(CFG.coverSel)?.attr("content"));
    const description = (doc.selectFirst(CFG.descSel)?.attr("content") || "").trim();

    const seen = {};
    const chapters = [];
    for (const a of doc.select(`a[href*='${CFG.chapterLinkContains}']`)) {
      const link = this.abs(a.attr("href").split("?")[0]);
      if (seen[link]) continue;
      let chName = (a.attr("title") || a.text || "").trim();
      // strip leading "#485" and trailing date like "August 24, 2026"
      chName = chName
        .replace(/^#\d+\s*/, "")
        .replace(/\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\s*$/, "")
        .trim();
      if (!chName) continue;
      seen[link] = true;
      chapters.push({ name: chName, url: link });
    }
    return { name, imageUrl, description, link: url, status: 5, genre: [], chapters };
  }

  async getHtmlContent(name, url) {
    const doc = await this.getDoc(url);
    const body = doc.selectFirst(CFG.chapterContentSel);
    if (!body) return "<p>Chapter content not found. Check selectors in CFG.</p>";
    return body.innerHtml;
  }

  async cleanHtmlContent(html) { return html; }
  getFilterList() { return []; }
  getSourcePreferences() { return []; }
}
