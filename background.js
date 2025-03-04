// Store the latest experiment data per tab
const experimentDataMap = new Map();

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!sender.tab) {
        return false;
    }

    if (message.type === 'EXPERIMENTS_DETECTED') {
        experimentDataMap.set(sender.tab.id, message.data);
        return false;
    }
    
    if (message.type === 'GET_EXPERIMENTS') {
        const data = experimentDataMap.get(sender.tab.id);
        sendResponse({data: data});
        return true;
    }
});

// When the extension icon is clicked, inject the content script
chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ['content.js']
    }).catch(err => console.error('Failed to inject content script:', err));
}); 