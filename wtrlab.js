const mangayomiSources = [{
  "name": "WTR-Lab",
  "lang": "en",
  "baseUrl": "https://wtr-lab.com",
  "apiUrl": "",
  "iconUrl": "https://wtr-lab.com/favicon.ico",
  "typeSource": "single",
  "itemType": 2,
  "version": "0.0.1",
  "pkgPath": "novel/src/en/wtrlab.js"
}];

// ---- SITE CONFIG ----
const CFG = {
  popularPath: "/en/novel-list?page={page}",
  latestPath: "/en/novel-list?orderBy=update&page={page}",  // guess
  searchPath: "/en/novel-list?text={q}&page={page}",        // guess
  translate: "ai",                                          // "ai" or "web"
  language: "en"
};

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  get base() { return "https://wtr-lab.com"; }

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
    for (const a of doc.select("a[href*='/novel/']")) {
      const href = a.attr("href").split("?")[0];
      if (!/\/novel\/\d+\//.test(href) || /\/chapter-\d+/.test(href)) continue;
      const img = a.selectFirst("img");
      if (!img) continue;
      const link = this.abs(href);
      if (seen[link]) continue;
      const name = (img.attr("alt") || a.attr("title") || a.text || "").trim();
      if (!name) continue;
      seen[link] = true;
      list.push({ name, link, imageUrl: this.abs(img.attr("src") || img.attr("data-src")) });
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
    url = url.split("?")[0].replace(/\/$/, "");
    const m = url.match(/\/novel\/(\d+)\//);
    const rawId = m ? m[1] : "";
    const doc = await this.getDoc(url);

    const name = (doc.selectFirst("h1")?.text || "").trim();
    const imageUrl = this.abs(doc.selectFirst("meta[property='og:image']")?.attr("content"));
    const pageText = (doc.selectFirst("body")?.text || "");

    let description = "";
    const dm = pageText.match(/Novel Summary\s*([\s\S]*?)\s*Show more/);
    if (dm) description = dm[1].trim();

    // Chapters: try the site's API for titles, fall back to numbered list
    let chapters = [];
    try {
      const res = await this.client.get(`${this.base}/api/chapters/${rawId}`, this.headers);
      const j = JSON.parse(res.body);
      const arr = j.chapters || (j.data && j.data.chapters) || [];
      for (const c of arr) {
        const no = c.order || c.chapter_no || c.index;
        if (!no) continue;
        chapters.push({
          name: c.title ? `Chapter ${no}: ${c.title}` : `Chapter ${no}`,
          url: `${url}/chapter-${no}`
        });
      }
    } catch (e) {}

    if (chapters.length === 0) {
      const cm = pageText.match(/Chapters\s*(\d+)/);
      const total = cm ? parseInt(cm[1]) : 0;
      for (let i = 1; i <= total; i++) {
        chapters.push({ name: `Chapter ${i}`, url: `${url}/chapter-${i}` });
      }
    }
    chapters.reverse(); // newest first

    return { name, imageUrl, description, link: url, status: 5, genre: [], chapters };
  }

  async getHtmlContent(name, url) {
    const m = url.match(/\/novel\/(\d+)\/[^/]+\/chapter-(\d+)/);
    if (!m) return "<p>Bad chapter URL.</p>";
    try {
      const res = await this.client.post(
        `${this.base}/api/reader/get`,
        Object.assign({ "Content-Type": "application/json" }, this.headers),
        {
          translate: CFG.translate,
          language: CFG.language,
          raw_id: parseInt(m[1]),
          chapter_no: parseInt(m[2]),
          retry: false,
          force_retry: false
        }
      );
      const j = JSON.parse(res.body);
      const body =
        (j.data && j.data.data && j.data.data.body) ||
        (j.data && j.data.body) || [];
      if (body.length > 0) {
        return body
          .map((p) => `<p>${String(p).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
          .join("\n");
      }
    } catch (e) {}
    return "<p>Chapter text could not be loaded (API may have changed or chapter is locked).</p>";
  }

  async cleanHtmlContent(html) { return html; }
  getFilterList() { return []; }
  getSourcePreferences() { return []; }
}
