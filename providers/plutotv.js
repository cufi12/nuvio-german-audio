const BOOT = "https://boot.pluto.tv";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

async function json(url, options) {
  const response = await fetch(url, options || {});
  if (!response.ok) throw new Error("PlutoTV HTTP " + response.status);
  return response.json();
}

async function session() {
  const params = new URLSearchParams({
    appName: "web",
    appVersion: "9.22.0",
    deviceVersion: "142.0.0",
    deviceModel: "web",
    deviceMake: "firefox",
    clientID: "debridui-german-provider",
    clientModelNumber: "1.0.0"
  });
  const boot = await json(BOOT + "/v4/start?" + params.toString(), {
    headers: { "User-Agent": UA }
  });
  return {
    token: boot.sessionToken,
    servers: boot.servers
  };
}

function auth(token) {
  return {
    "Authorization": "Bearer " + token,
    "User-Agent": UA,
    "Accept": "application/json"
  };
}

function norm(value) {
  return String(value || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function matches(title, candidates) {
  const value = norm(title);
  return !!value && candidates.some(candidate => {
    const wanted = norm(candidate);
    return wanted && (value === wanted ||
      (wanted.length > 4 && (value.includes(wanted) || wanted.includes(value))));
  });
}

async function getItemDetails(servers, token, ids) {
  if (!ids.length) return [];
  const url = servers.vod + "/v4/vod/items?ids=" +
    encodeURIComponent(ids.join(","));
  return json(url, { headers: auth(token) });
}

function streamFrom(stitched, servers, token, title) {
  if (!stitched || !stitched.path) return null;
  const kind = stitched.type;
  let url, quality;
  if (!kind || kind === "hls") {
    url = servers.stitcher + "/v2" + stitched.path;
    quality = "HLS";
  } else if (kind === "dash" || kind === "mpd") {
    url = servers.stitcherDash + "/v2" + stitched.path;
    quality = "DASH";
  } else {
    return null;
  }
  return {
    name: "Pluto TV",
    title: title || "Pluto TV",
    url,
    quality,
    headers: { Authorization: "Bearer " + token, "User-Agent": UA }
  };
}

module.exports = {
  async getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType !== "movie" && mediaType !== "tv") return [];
    try {
      const meta = await json(
        "https://api.themoviedb.org/3/" + mediaType + "/" +
        encodeURIComponent(tmdbId) + "?api_key=" +
        encodeURIComponent(globalThis.TMDB_API_KEY) + "&language=de-DE",
        { headers: { "User-Agent": UA } }
      );
      const titles = [meta.title, meta.name, meta.original_title, meta.original_name]
        .filter(Boolean);
      if (!titles.length) return [];

      const { token, servers } = await session();
      const search = await json(
        servers.search + "/v1/search?q=" + encodeURIComponent(titles[0]) + "&limit=100",
        { headers: auth(token) }
      );
      const searchItems = (search.data || []).filter(item => {
        const typeOk = mediaType === "movie"
          ? item.type === "movie"
          : item.type === "series";
        return typeOk && matches(item.name, titles);
      });
      if (!searchItems.length) return [];

      const details = await getItemDetails(
        servers, token, searchItems.slice(0, 8).map(item => item.id)
      );
      const output = [];
      for (const item of details || []) {
        if (mediaType === "movie") {
          const result = streamFrom(item.stitched, servers, token, item.name);
          if (result) output.push(result);
          continue;
        }

        const seasonInfo = await json(
          servers.vod + "/v4/vod/series/" + encodeURIComponent(item._id) + "/seasons",
          { headers: auth(token) }
        );
        for (const seasonData of (seasonInfo.seasons || [])) {
          if (season != null && Number(seasonData.number) !== Number(season)) continue;
          const episodes = seasonData.episodes || [];
          for (let index = 0; index < episodes.length; index++) {
            const ep = episodes[index];
            if (episode != null && Number(ep.number) !== Number(episode) &&
                index + 1 !== Number(episode)) continue;
            const result = streamFrom(ep.stitched, servers, token,
              (seasonInfo.name || item.name) + " · " + (ep.name || "Episode"));
            if (result) output.push(result);
          }
        }
      }
      return output;
    } catch (error) {
      console.error("PlutoTV:", error && error.message ? error.message : String(error));
      return [];
    }
  }
};
