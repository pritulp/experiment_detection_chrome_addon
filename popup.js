// Function to create a card for platforms, tag managers, or analytics tools
function createCard(item) {
    const card = document.createElement('div');
    card.className = 'platform-card';
    
    const name = document.createElement('div');
    name.className = 'platform-name';
    
    const nameText = document.createElement('span');
    nameText.textContent = item.name.charAt(0).toUpperCase() + item.name.slice(1);
    name.appendChild(nameText);
    
    const badge = document.createElement('span');
    badge.className = 'type-badge';
    badge.textContent = item.type;
    name.appendChild(badge);
    
    const detail = document.createElement('div');
    detail.className = 'platform-detail';
    
    // Add different details based on the type
    if (item.identificationMethods) {
        detail.textContent = `ID Methods: ${item.identificationMethods.map(m => m.type).join(', ')}`;
    } else if (item.source) {
        detail.textContent = `Source: ${item.source}`;
    }
    
    card.appendChild(name);
    card.appendChild(detail);
    return card;
}

// Function to create experiments table
function createExperimentsTable(experiments) {
    if (!experiments || experiments.length === 0) {
        const noData = document.createElement('div');
        noData.className = 'no-data';
        noData.textContent = 'No active experiments detected';
        return noData;
    }

    const table = document.createElement('table');
    
    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Name', 'Type', 'ID', 'Variation', 'Randomization'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    experiments.forEach(exp => {
        const row = document.createElement('tr');
        
        // Name cell
        const nameCell = document.createElement('td');
        nameCell.textContent = exp.name;
        nameCell.title = exp.name;
        
        // Type cell
        const typeCell = document.createElement('td');
        const type = exp.type || 'experiment';
        typeCell.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        typeCell.title = type;
        
        // ID cell
        const idCell = document.createElement('td');
        idCell.textContent = exp.id;
        idCell.title = exp.id;
        
        // Variation cell
        const variationCell = document.createElement('td');
        variationCell.textContent = exp.variation;
        variationCell.title = exp.variation;

        // Randomization cell
        const randomizationCell = document.createElement('td');
        let randomization = 'Unknown';
        if (exp.identificationMethods) {
            const methods = exp.identificationMethods.map(m => m.type);
            if (methods.includes('userID')) randomization = 'User ID';
            else if (methods.includes('cookieID')) randomization = 'Cookie';
            else if (methods.includes('visitorID')) randomization = 'Visitor';
            else if (methods.includes('stableID')) randomization = 'Stable ID';
            else randomization = methods[0];
        }
        randomizationCell.textContent = randomization;
        randomizationCell.title = randomization;
        
        row.appendChild(nameCell);
        row.appendChild(typeCell);
        row.appendChild(idCell);
        row.appendChild(variationCell);
        row.appendChild(randomizationCell);
        
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    
    return table;
}

// Function to create a section with no data
function createNoDataSection(message) {
    const noData = document.createElement('div');
    noData.className = 'no-data';
    noData.textContent = message;
    return noData;
}

// Function to update the UI with detection results
function updateUI(results) {
    console.log('Updating UI with results:', results);
    
    // Update counters
    document.getElementById('tms-count').textContent = results.tagManagers?.length || 0;
    document.getElementById('analytics-count').textContent = results.analyticsTools?.length || 0;
    document.getElementById('platforms-count').textContent = results.platforms?.length || 0;
    document.getElementById('experiments-count').textContent = results.experiments?.length || 0;
    
    // Update tag managers
    const tagManagersContainer = document.getElementById('tagmanagers-container');
    tagManagersContainer.innerHTML = '';
    if (!results.tagManagers || results.tagManagers.length === 0) {
        tagManagersContainer.appendChild(createNoDataSection('No tag managers detected'));
    } else {
        results.tagManagers.forEach(tm => {
            tagManagersContainer.appendChild(createCard(tm));
        });
    }
    
    // Update analytics tools
    const analyticsContainer = document.getElementById('analytics-container');
    analyticsContainer.innerHTML = '';
    if (!results.analyticsTools || results.analyticsTools.length === 0) {
        analyticsContainer.appendChild(createNoDataSection('No analytics tools detected'));
    } else {
        results.analyticsTools.forEach(tool => {
            analyticsContainer.appendChild(createCard(tool));
        });
    }
    
    // Update platforms
    const platformsContainer = document.getElementById('platforms-container');
    platformsContainer.innerHTML = '';
    if (!results.platforms || results.platforms.length === 0) {
        platformsContainer.appendChild(createNoDataSection('No experimentation platforms detected'));
    } else {
        results.platforms.forEach(platform => {
            platformsContainer.appendChild(createCard(platform));
        });
    }
    
    // Update experiments
    const experimentsContainer = document.getElementById('experiments-container');
    experimentsContainer.innerHTML = '';
    experimentsContainer.appendChild(createExperimentsTable(results.experiments));
    
    // Add note if present
    if (results.note) {
        const note = document.createElement('div');
        note.className = 'note';
        note.textContent = results.note;
        experimentsContainer.appendChild(note);
    }
}

// Function to show error message
function showError(message) {
    console.error('Showing error:', message);
    const containers = [
        'tagmanagers-container',
        'analytics-container',
        'platforms-container',
        'experiments-container'
    ];
    containers.forEach(containerId => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        container.appendChild(createNoDataSection(message));
    });
    
    // Reset counters
    ['tms-count', 'analytics-count', 'platforms-count', 'experiments-count'].forEach(id => {
        document.getElementById(id).textContent = '0';
    });
}

// Function to check if content script is already injected
function isContentScriptInjected(tabId) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'PING' }, response => {
            resolve(!chrome.runtime.lastError && response === 'PONG');
        });
    });
}

// Function to inject content script if not already injected
async function injectContentScriptIfNeeded(tabId) {
    const isInjected = await isContentScriptInjected(tabId);
    if (!isInjected) {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });
        // Small delay to ensure script is initialized
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

// Function to get experiments data
function getExperimentsData(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: "GET_EXPERIMENTS" }, function(response) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(response);
            }
        });
    });
}

// Main initialization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Get the active tab
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        const activeTab = tabs[0];
        
        // Check if we can access the tab
        if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome://')) {
            showError('Cannot scan this page. Try a different website.');
            return;
        }

        console.log('Scanning tab:', activeTab.url);

        try {
            await injectContentScriptIfNeeded(activeTab.id);
            console.log('Content script ready');
            
            const response = await getExperimentsData(activeTab.id);
            console.log('Got response:', response);
            
            if (response && response.data) {
                updateUI(response.data);
            } else {
                showError('No experiment data detected.');
            }
        } catch (err) {
            console.error('Error:', err);
            showError('Unable to scan this page. Try refreshing.');
        }
    } catch (err) {
        console.error('Main error:', err);
        showError('An error occurred. Please try again.');
    }
}); 