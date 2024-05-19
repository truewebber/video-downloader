import {parse} from 'hls-parser';
import {MasterPlaylist} from "hls-parser/types.js";
import {Events, ErrorData, Hls, ManifestParsedData} from 'hls.js';

chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    const currentTab = tabs[0];
    const videoTitle = currentTab.title ? currentTab.title : 'video'

    if (!currentTab.id) {
        return;
    }

    chrome.scripting.executeScript({
        target: {tabId: currentTab.id},
        injectImmediately: true,
        func: (selector: string): string => {
            const element = document.querySelector(selector);
            return element ? element.outerHTML : '';
        },
        args: ['iframe']
    }, async (results) => {
        if (results && results[0] && results[0].result) {
            const htmlContent = results[0].result;
            const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
            const iframeElements = doc.getElementsByTagName('iframe');

            if (!iframeElements || iframeElements.length == 0) {
                return;
            }

            const iframe = iframeElements[0] as HTMLIFrameElement;
            const m3u8Link = await getM3U8link(iframe.src);

            console.log(m3u8Link);

            const detectedVideos = await fetchAndParseM3U8(m3u8Link);

            makeVideoDownloadButtons(videoTitle, detectedVideos);
        } else {
            console.error('Failed to retrieve HTML content.');
        }
    });
});

export interface DetectedVideo {
    width: number;
    height: number;
    url: string;
}

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

    const variants = (playlist as MasterPlaylist).variants;

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
    });

    return Object.values(variantsMap);
}

async function getM3U8link(link: string): Promise<string> {
    const response = await fetch(link)
    if (!response.ok) {
        return '';
    }

    const body = await response.text();

    const doc = new DOMParser().parseFromString(body, 'text/html');
    const scriptElements = doc.getElementsByTagName('script');

    for (const script of scriptElements) {
        if (!script.textContent) {
            continue;
        }

        const scriptContent = script.textContent.trim();

        if (!scriptContent.startsWith('window.configs =')) {
            continue;
        }

        const splitScriptContent = scriptContent.split('window.configs =')

        if (splitScriptContent.length != 2) {
            continue;
        }

        const stringConfig = splitScriptContent[1].trim();
        const obj = JSON.parse(stringConfig)

        return obj.masterPlaylistUrl;
    }

    return '';
}

// chrome.storage.local.get(dataKey, (result) => {
//     const titleElem = document.getElementById('title')!;
//
//     const videosString: string = result[dataKey];
//
//     console.log(result);
//     console.log(dataKey, videosString);
//
//     if (!videosString || videosString === "") {
//         titleElem.textContent = 'No playlist was detected.';
//         return;
//     }
//
//     titleElem.textContent = 'Here is what I found';
//     makeVideoDownloadButtons(videoTitle, videosString);
// });

function makeVideoDownloadButtons(videoTitle: string, videos: DetectedVideo[]): void {
    try {
        const videosElem = document.getElementById('videos')!;

        videos.forEach((video) => {
            const elemButton = document.createElement('button');
            elemButton.textContent = `${video.width}x${video.height}`;
            elemButton.addEventListener('click', () => {
                downloadVideo(videoTitle, video.url).then();
            });

            const elem = document.createElement('li');
            elem.appendChild(elemButton);

            videosElem.appendChild(elem);
        });
    } catch (error) {
        console.error('Error creating download buttons:', error);
    }
}

async function downloadVideo(videoTitle: string, m3u8videoURL: string): Promise<void> {
    updateProgress(0);

    const hls = new Hls();
    hls.loadSource(m3u8videoURL);

    hls.on(Hls.Events.MANIFEST_PARSED, async (event: Event, data: ManifestParsedData) => {
        try {
            const levels = data.levels;
            if (levels.length === 0) {
                return;
            }

            const fragments = levels[0].details?.fragments || [];
            const fragmentURLs: string[] = fragments.map(fragment => fragment.url);

            const segments = await fetchAllSegmentsWithProgress(fragmentURLs);
            const concatenatedBuffer = concatenateBuffers(segments);
            const blob = new Blob([concatenatedBuffer], {type: 'video/mp2t'});

            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.style.display = 'none';

            a.download = `${videoTitle}.ts`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            progressClear();
        } catch (error) {
            progressError();
            console.error('Error downloading video:', error);
        }
    });

    hls.on(Hls.Events.ERROR, (event: Events.ERROR, data: ErrorData) => {
        progressError();
        console.error('HLS.js error:', data);
    });
}

async function fetchTS(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}`);
    }
    return await response.arrayBuffer();
}

async function fetchAllSegmentsWithProgress(segmentURLs: string[]): Promise<ArrayBuffer[]> {
    const totalSegments = segmentURLs.length;
    let completedSegments = 0;

    const segmentPromises = segmentURLs.map(async (url) => {
        try {
            const segment = await fetchTS(url);
            completedSegments++;
            const progress = (completedSegments / totalSegments) * 100;
            updateProgress(progress);
            return segment;
        } catch (error) {
            progressError();
            console.error(`Error fetching segment ${url}:`, error);
            throw error;
        }
    });

    return Promise.all(segmentPromises);
}

function updateProgress(progress: number): void {
    const progressBar = document.getElementById('progressBar')!;
    progressBar.style.width = `${progress}%`;
    progressBar.textContent = `${Number(progress.toFixed(2))}%`;
}

function progressClear(): void {
    const progressBar = document.getElementById('progressBar')!;
    progressBar.style.width = `0%`;
    progressBar.textContent = ``;
}

function progressError(): void {
    const progressBar = document.getElementById('progressBar')!;
    progressBar.style.width = `0%`;
    progressBar.textContent = `fail`;
}

function concatenateBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
    const totalLength = buffers.reduce((acc, buffer) => acc + buffer.byteLength, 0);
    const concatenated = new Uint8Array(totalLength);
    let offset = 0;
    for (const buffer of buffers) {
        concatenated.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    }
    return concatenated.buffer;
}
