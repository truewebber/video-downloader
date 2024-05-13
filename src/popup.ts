import Hls from 'hls.js';
import {FFmpeg} from '@ffmpeg/ffmpeg';

import {DetectedVideo} from './types/detected.js';

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

    let i = 0;

    videos.forEach(video => {
        i++;

        const videoID = `downloadBtn${i}`;

        const elemButton = document.createElement('button')
        elemButton.setAttribute('id', videoID);
        elemButton.textContent = `${video.width}x${video.height}`;

        const elem = document.createElement('li');
        elem.appendChild(elemButton);

        elem.addEventListener('click', () => {
            downloadHLSVideo(video.url);
        });

        videosElem.appendChild(elem);
    })
}

// Function to download and combine HLS segments
async function downloadHLSVideo(m3u8Url: string): Promise<void> {
    console.log('clicked');

    const hls = new Hls();

    // Load the manifest (m3u8 file)
    hls.loadSource(m3u8Url);

    // Wait for the manifest to be parsed
    hls.on(Hls.Events.MANIFEST_PARSED, async () => {
        const segments = hls.levels[0].details?.fragments.map(frag => new URL(frag.url, m3u8Url).href) || [];

        const ffmpeg = new FFmpeg();
        await ffmpeg.load();

        // Download each segment
        for (const [index, segmentUrl] of segments.entries()) {
            const response = await fetch(segmentUrl);
            const data = await response.arrayBuffer();
            const filename = `segment${index}.ts`;
            await ffmpeg.writeFile(filename, new Uint8Array(data));
        }

        // Combine segments using FFmpeg
        await ffmpeg.exec(
            [
                '-i', `concat:${segments.map((_, index) => `segment${index}.ts`).join('|')}`,
                '-c', 'copy',
                'output.mp4'
            ]
        );

        // Retrieve the combined video file
        const data = await ffmpeg.readFile('output.mp4');
        const videoBlob = new Blob([data], {type: 'video/mp4'});
        const url = URL.createObjectURL(videoBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'output.mp4';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        console.log('Video downloaded successfully!');
    });
}
