import WebRequestDetails = chrome.webRequest.WebRequestDetails;

import {parse} from 'hls-parser';
import {MasterPlaylist} from "hls-parser/types.js";

import {DetectedVideo} from "./types/detected.js";

let requestsInProgress: { [key: string]: boolean } = {};

const listenM3U8 = (details: WebRequestDetails) => {
    const requestedURL = new URL(details.url);

    if (!requestedURL.pathname.endsWith('.m3u8')) {
        return;
    }

    console.log('detected', details.url);

    const key = '_in_progress_' + details.tabId.toString()

    if (requestsInProgress[key]) {
        console.log('already in progress', details.url);

        return;
    }

    requestsInProgress[key] = true;

    console.log('processing', details.url);

    fetchAndParseM3U8(details.url).then(
        (videos) => {
            const encodedVideos = JSON.stringify(videos)
            chrome.storage.local.set({[details.tabId]: encodedVideos}).then();
        }
    )
        .catch((e: any) => console.error(e))
        .finally(() => {
            // delete requestsInProgress[key];
            console.log('done, stop listening', details.url);
        });
};

chrome.webRequest.onBeforeRequest.hasListener(listenM3U8) &&
chrome.webRequest.onBeforeRequest.removeListener(listenM3U8);
chrome.webRequest.onBeforeRequest.addListener(listenM3U8, {urls: ["<all_urls>"]});

async function fetchAndParseM3U8(url: string): Promise<DetectedVideo[]> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data: string = await response.text();

    return parseM3U8(data);
}

function parseM3U8(content: string): DetectedVideo[] {
    const playlist = parse(content);

    if (!playlist.isMasterPlaylist) {
        return [];
    }

    const variants = (playlist as MasterPlaylist).variants

    let variantsMap: { [key: string]: DetectedVideo } = {};

    variants.forEach(variant => {
        const width = variant.resolution?.width || 0;
        const height = variant.resolution?.height || 0;

        const bandwidth = variant.bandwidth.toString();

        const codecs = variant.codecs || "unknown";

        const key = `${width}x${height}.${bandwidth}.${codecs}`;

        variantsMap[key] = {
            width: width,
            height: height,
            url: variant.uri,
        }
    })

    return Object.values(variantsMap);
}


// Clean up storage when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.remove(tabId.toString()).then();
});
