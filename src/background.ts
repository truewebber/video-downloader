import WebRequestDetails = chrome.webRequest.WebRequestDetails;
import { parse } from 'hls-parser';

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
        () => {
            chrome.storage.local.set({[details.tabId]: true}).then();
        }
    )
        .catch((e: any) => console.error(e))
        .finally(() => {
            delete requestsInProgress[key];
            console.log('done', details.url);
        });
};

chrome.webRequest.onBeforeRequest.hasListener(listenM3U8) &&
chrome.webRequest.onBeforeRequest.removeListener(listenM3U8);
chrome.webRequest.onBeforeRequest.addListener(listenM3U8, {urls: ["<all_urls>"]});

async function fetchAndParseM3U8(url: string): Promise<void> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data: string = await response.text();

    console.log('M3U8 Content:', data); // Confirming data is correctly logged

    parseM3U8(data);
}

function parseM3U8(content: string): void {
    const playlist = parse(content);

    console.log(playlist);
}


// Clean up storage when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.remove(tabId.toString()).then();
});
