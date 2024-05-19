import {DetectedVideo} from './types/detected.js';
import {Hls, ManifestParsedData} from 'hls.js'

chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    const currentTab = tabs[0];

    const currentTabID = currentTab.id;

    if (!currentTabID) {
        return;
    }

    chrome.storage.local.get(currentTabID.toString(), (result) => {
        const titleElem = document.getElementById('title')!;

        const videosString: string = result[currentTabID]

        console.log(currentTabID, videosString)

        if (!videosString || videosString === "") {
            titleElem.textContent = 'No playlist was detected.';

            return;
        }

        titleElem.textContent = 'Here is what I found';

        makeVideoDownloadButtons(videosString);
    });
});

function makeVideoDownloadButtons(videosString: string): void {
    const videos = JSON.parse(videosString) as DetectedVideo[]
    const videosElem = document.getElementById('videos')!;

    videos.forEach(video => {
        const elemButton = document.createElement('button')
        elemButton.textContent = `${video.width}x${video.height}`;
        elemButton.addEventListener('click', () => {
            downloadVideo(video.url).then();
        });

        const elem = document.createElement('li');
        elem.appendChild(elemButton);

        videosElem.appendChild(elem);
    })
}

async function downloadVideo(m3u8videoURL: string): Promise<void> {
    const hls = new Hls();
    hls.loadSource(m3u8videoURL);

    hls.on(Hls.Events.MANIFEST_PARSED, async (event: Event, data: ManifestParsedData) => {
        const levels = data.levels;
        if (levels.length === 0) {
            return;
        }

        const fragments = levels[0].details?.fragments || [];

        const fragmentURLs: string[] = [];
        fragments.forEach(fragment => {
            fragmentURLs.push(fragment.url);
        });

        const segments = await fetchAllSegments(fragmentURLs);
        const concatenatedBuffer = concatenateBuffers(segments);
        const blob = new Blob([concatenatedBuffer], {type: 'video/mp2t'});

        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob);
        a.style.display = 'none';
        a.download = 'video.ts';
        document.body.appendChild(a);
        a.click();


        document.body.removeChild(a);
    });
}

async function fetchTS(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}`);
    }
    return await response.arrayBuffer();
}

async function fetchAllSegments(segmentURLs: string[]): Promise<ArrayBuffer[]> {
    const segments: ArrayBuffer[] = [];
    for (const url of segmentURLs) {
        try {
            const segment = await fetchTS(url);
            segments.push(segment);
        } catch (error) {
            console.error(`Error fetching segment ${url}:`, error);
        }
    }
    return segments;
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
