const API = "https://api.netzkino.de.simplecache.net/capi-2.0a";

async function json(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      "Accept": "application/json"
    }
  });
  if (!response.ok) throw new Error("Netzkino HTTP " + response.status);
  return response.json();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  async getStreams(tmdbId, mediaType) {
    if (mediaType !== "movie") return [];
    try {
      const metaResponse = await json(
        "https://api.themoviedb.org/3/movie/" + encodeURIComponent(tmdbId) +
        "?api_key=" + encodeURIComponent(globalThis.TMDB_API_KEY) + "&language=de-DE"
      );
      const titles = [metaResponse.title, metaResponse.original_title].filter(Boolean);
      const year = (metaResponse.release_date || "").slice(0, 4);
      const found = new Map();

      for (const title of titles) {
        const search = await json(API + "/search?q=" + encodeURIComponent(title) + "&d=www");
        for (const post of list(search.posts)) {
          if (post.id != null) found.set(String(post.id), post);
        }
      }

      const streams = [];
      // Keep comfortably below DebridUI's 24-request provider limit.
      for (const post of Array.from(found.values()).slice(0, 8)) {
        const detail = await json(API + "/movies/" + encodeURIComponent(post.id) + ".json?d=www");
        const fields = detail.custom_fields || {};
        const streamSlugs = list(fields.Streaming);
        if (!streamSlugs.length) continue;

        const resultYear = list(fields.Jahr)[0];
        if (year && resultYear && String(resultYear) !== year) continue;

        for (const slug of streamSlugs) {
          if (typeof slug !== "string" || !slug.trim()) continue;
          streams.push({
            name: "Netzkino · Deutsch",
            title: detail.title || post.title || metaResponse.title,
            url: "https://pmd.netzkino-seite.netzkino.de/" + slug + ".mp4",
            quality: "auto",
            headers: { Referer: "https://www.netzkino.de/" }
          });
        }
      }
      return streams;
    } catch (error) {
      console.error("Netzkino:", error && error.message ? error.message : String(error));
      return [];
    }
  }
};
