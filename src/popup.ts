// Query the active tab to see if a `.m3u8` request was detected
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];

    const currentTabID = currentTab.id;

    if(!currentTabID) {
        return;
    }

    chrome.storage.local.get(currentTabID.toString(), (result) => {
        const statusElement = document.getElementById('status')!;
        if (result[currentTabID]) {
            statusElement.textContent = 'M3U8 request detected!';
        } else {
            statusElement.textContent = 'No M3U8 request detected.';
        }
    });
});
