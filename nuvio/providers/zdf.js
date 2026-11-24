const API = "https://api.zdf.de";
const WEB = "https://www.zdf.de";
const TOKEN = "aa3noh4ohz9eeboo8shiesheec9ciequ9Quah7el";
const HEADERS = {
  "api-auth": "Bearer " + TOKEN,
  "Origin": WEB,
  "Content-Type": "application/json",
  "Accept": "application/json"
};
const HASH = {
  search: "5f8ae3abb4189c371a3297f8e669c755d08e35b491ebe37bf9e6e34a742518d9",
  collection: "f9cd12864be90dd97d015b59fb515ea9d464b14db543ae349fc474a96e49de0b",
  video: "f523709f46392d91135ab82fa5fe03390c4d052e83270ed2c3a8d8e1e0995489"
};

async function getJson(url, options) {
  const response = await fetch(url, options || {});
  if (!response.ok) throw new Error("HTTP " + response.status + " " + url);
  return response.json();
}

async function graphql(operationName, hash, variables) {
  return getJson(API + "/graphql", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      operationName,
      variables,
      extensions: {
        clientLibrary: { name: "@apollo/client", version: "4.1.9" },
        persistedQuery: { version: 1, sha256Hash: hash }
      }
    })
  });
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function titleMatches(candidate, titles) {
  const value = normalize(candidate);
  return !!value && titles.some(title => {
    const wanted = normalize(title);
    return wanted && (value === wanted || (wanted.length > 4 && (value.includes(wanted) || wanted.includes(value))));
  });
}

function isGermanTrack(language) {
  // ZDF reports ISO language tags such as "de", "de-DE" or "deu".
  return /^(de(?:[-_]|$)|deu$|ger$)/i.test(String(language || "").trim());
}

async function getVideo(canonical) {
  const result = await graphql("GetPlayableVideoByCanonical", HASH.video, { canonical });
  return result && result.data && result.data.videoByCanonical;
}

async function playableStreams(canonical, displayTitle) {
  const video = await getVideo(canonical);
  const template = video && video.currentMedia && video.currentMedia.nodes &&
    video.currentMedia.nodes.find(node => node.ptmdTemplate);
  if (!template) return [];

  const playerUrl = API + template.ptmdTemplate.replace("{playerId}", "ngplayer_2_5");
  const player = await getJson(playerUrl, { headers: HEADERS });
  const streams = [];
  for (const group of (player.priorityList || [])) {
    for (const format of (group.formitaeten || [])) {
      for (const quality of (format.qualities || [])) {
        for (const track of ((quality.audio && quality.audio.tracks) || [])) {
          if (!track.uri || !isGermanTrack(track.language)) continue;
          streams.push({
            name: "CVN-ZDF",
            title: displayTitle || video.title || "ZDF",
            url: track.uri,
            quality: Number(quality.highestVerticalResolution) || "auto",
            headers: HEADERS
          });
        }
      }
    }
  }
  return streams;
}

module.exports = {
  async getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType !== "movie" && mediaType !== "tv") return [];
    try {
      const meta = await getJson(
        "https://api.themoviedb.org/3/" + mediaType + "/" +
        encodeURIComponent(tmdbId) + "?api_key=" +
        encodeURIComponent(globalThis.TMDB_API_KEY) + "&language=de-DE"
      );
      const titles = [meta.title, meta.name, meta.original_title, meta.original_name].filter(Boolean);
      if (!titles.length) return [];

      let candidates = [];
      for (const query of titles.slice(0, 3)) {
        const response = await graphql("getSearchResults", HASH.search, {
          query, mode: "ALL_RESULTS_INCLUDING_TOP_RESULTS",
          group: "gruppe-b", first: 24, after: null
        });
        const results = response && response.data && response.data.searchDocuments &&
          response.data.searchDocuments.results || [];
        candidates.push(...results.map(result => result.item).filter(Boolean));
      }

      const unique = new Map();
      for (const item of candidates) {
        if (item.canonical) unique.set(item.canonical, item);
      }
      const matches = Array.from(unique.values()).filter(item => titleMatches(item.title, titles));
      const targetYear = (meta.release_date || meta.first_air_date || "").slice(0, 4);
      const yearMatches = matches.filter(item => {
        const year = String(item.productionYear || item.editorialDate || "").slice(0, 4);
        return !targetYear || !year || year === targetYear;
      });
      const selected = yearMatches.length ? yearMatches : matches;
      const streams = [];

      if (mediaType === "movie") {
        for (const item of selected.slice(0, 5)) {
          const canonical = item.video && item.video.canonical;
          if (canonical) streams.push(...await playableStreams(canonical, item.title));
          else if (item.canonical) {
            try { streams.push(...await playableStreams(item.canonical, item.title)); } catch (_) {}
          }
        }
        return streams;
      }

      // Bound series/episode expansion so a single invocation stays under
      // DebridUI's request budget (24 requests per provider call).
      for (const item of selected.slice(0, 2)) {
        const detail = await graphql("GetSmartCollectionByCanonical", HASH.collection, {
          canonical: item.canonical
        });
        const collection = detail && detail.data && detail.data.smartCollectionByCanonical;
        const seasons = collection && collection.seasons && collection.seasons.seasons || [];
        let selectedEpisodes = [];
        for (const seasonData of seasons) {
          if (season != null && Number(seasonData.number) !== Number(season)) continue;
          const videos = seasonData.episodes && seasonData.episodes.videos || [];
          for (let index = 0; index < videos.length; index++) {
            const video = videos[index];
            if (episode != null && Number(video.episodeInfo && video.episodeInfo.episodeNumber) !== Number(episode) &&
                index + 1 !== Number(episode)) continue;
            if (video.canonical) selectedEpisodes.push(video);
          }
        }
        if (!selectedEpisodes.length && season == null && episode == null) {
          selectedEpisodes = seasons.flatMap(s => (s.episodes && s.episodes.videos) || []).slice(0, 2);
        }
        for (const video of selectedEpisodes.slice(0, 2)) {
          streams.push(...await playableStreams(video.canonical, video.title || item.title));
        }
      }
      return streams;
    } catch (error) {
      console.error("ZDF:", error && error.message ? error.message : String(error));
      return [];
    }
  }
};
