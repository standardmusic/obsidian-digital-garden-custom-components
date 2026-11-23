/*
 * Copyright (c) 2026 SwitchUpCB
 * Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-or-later).
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Contains portions derived from digitalgarden (https://github.com/oleeskild/digitalgarden/blob/6f961b793e9c4713c4790b6f1199d9fa2a38583e/src/plugins/dg-filetree/index.js)
 * Copyright (c) 2026 Ole Eskild Steensen — Licensed under the MIT License.
 */
const fs = require("fs");
const path = require("path");

function cleanUrlPath(urlPath) {
  let decoded = urlPath;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (e) { }

  return decoded
    .toLowerCase()
    .replace(/\s+/g, "-")               // spaces -> hyphens
    .replace(/[^a-z0-9\-_\/.]/g, "")    // keep ONLY a-z, 0-9, -, _, /, and .
    .replace(/\/-+/g, "/");             // clean leading hyphens after slashes (e.g. /🌐-foo -> /foo)
}

function shouldCleanPath(urlPath) {
  if (!urlPath || typeof urlPath !== "string") return false;
  if (!urlPath.startsWith("/") || urlPath.startsWith("//")) return false;
  if (
    urlPath.startsWith("/img/") ||
    urlPath.startsWith("/styles/") ||
    urlPath.startsWith("/plugins/") ||
    urlPath.startsWith("/assets/")
  ) {
    return false;
  }
  return true;
}

function cleanHref(rawHref) {
  const match = rawHref.match(/^([^?#]+)([?#].*)?$/);
  if (!match) return rawHref;
  const [, pathname, suffix = ""] = match;
  if (!shouldCleanPath(pathname)) return rawHref;
  return `${cleanUrlPath(pathname)}${suffix}`;
}

function setupEleventy(eleventyConfig, context) {
  console.log("[obsidian-digital-garden-custom-components] setupEleventy(eleventyConfig, context)");

  // 1. Clean permalinks for all notes before Eleventy computes output paths
  eleventyConfig.addPreprocessor("clean-permalinks", "md", function (data, content) {
    const stem = (this.page && this.page.filePathStem) || "";
    const input = this.inputPath || "";

    if (!stem.startsWith("/notes/") && !input.includes("/notes/") && !input.includes("\\notes\\")) {
      return;
    }

    if (Array.isArray(data.tags) && data.tags.includes("gardenEntry")) {
      data.permalink = "/";
      return;
    }

    const rawPath =
      typeof data.permalink === "string"
        ? data.permalink
        : stem.replace(/^\/notes/, "");

    if (!rawPath) return;

    const cleaned = cleanUrlPath(rawPath);
    data.permalink = cleaned.endsWith("/") ? cleaned : `${cleaned}/`;
  });

  // 2. Precompute O(1) sort lookup map once per build (top level of setupEleventy)
  eleventyConfig.addCollection("navSortKeys", function (collectionApi) {
    const notes = collectionApi.getFilteredByTag("note");
    const map = Object.create(null);

    for (const item of notes) {
      const rawDate = item.data && (item.data["created-at"] || item.data.created);
      const sortKey = rawDate ? new Date(rawDate).toISOString() : "";
      if (item.url) {
        map[item.url] = sortKey;
        map[cleanHref(item.url)] = sortKey;
      }
      if (item.data && item.data.permalink) {
        map[item.data.permalink] = sortKey;
        map[cleanHref(item.data.permalink)] = sortKey;
      }
    }

    return map;
  });

  // 2.1 Render the filetree once to /filetree.html instead so the sidebar fetches it and marks the current note client-side.
  const treeTemplate = fs.readFileSync(
      path.join(context.pluginDir, "templates", "tree.njk"),
      "utf8"
    );
    
    eleventyConfig.addTemplate("dg-filetree-tree.njk", treeTemplate, {
      permalink: "/filetree.html",
      eleventyExcludeFromCollections: true,
    });

  // 3. Clean internal <a href="..."> tags in HTML and URLs in Search/Graph JSON
  eleventyConfig.addTransform("clean-urls", function (content) {
    const out = this.page && this.page.outputPath;
    if (!out) return content;

    if (out.endsWith(".html")) {
      return content.replace(/href="(\/[^"]*)"/g, (match, rawHref) => {
        return `href="${cleanHref(rawHref)}"`;
      });
    }

    if (out.endsWith(".json")) {
      return content.replace(/"url"\s*:\s*"(\/[^"]*)"/g, (match, rawUrl) => {
        return `"url": "${cleanHref(rawUrl)}"`;
      });
    }

    return content;
  });

  // Track Build Time and Memory Usage
  let buildStart = 0;

  eleventyConfig.on("eleventy.before", () => {
    buildStart = performance.now();
  });

  eleventyConfig.on("eleventy.after", () => {
    const elapsedSec = ((performance.now() - buildStart) / 1000).toFixed(2);
    const used = process.memoryUsage();
    const toMB = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;
    console.log(
      `[build] Time: ${elapsedSec}s | RSS: ${toMB(used.rss)} | Heap Used: ${toMB(used.heapUsed)} | Heap Total: ${toMB(used.heapTotal)}`
    );
  });
}

module.exports = {
  setupEleventy,
};
