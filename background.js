// background page, sole task is to send command to
// close a given tab.

// Map<TabID, true>
const CLOSED_ZOOM_TABS = {};

function isClosableZoomorSlackInviteURL(url) {
    const isZoomInviteURL = url.match(/https:\/\/(\S+\.)?zoom.us\/j\/.+/);
    const isSlackURL = url.match(/https:\/\/(\S+\.)?slack.com\/archives\/+/);
    const isSuccess = url.endsWith('#success');

    return ((isZoomInviteURL && isSuccess) || isSlackURL);
}



function ifEnabled(f) {
    chrome.storage.local.get({'enabled': true}, result => {
        if (result.enabled) f();
    });
}

chrome.runtime.onMessage.addListener(msg => {
    const tabId = msg.tabId;

    // this technical leaks some tabIds, but it's not serious -- Chrome
    // instances accumulate no more tha maybe 10,000s of zoom tabIds and V8
    // can handle those objects just fine.
    delete CLOSED_ZOOM_TABS[tabId];

    ifEnabled(() => {
        chrome.tabs.get(tabId, () => {
            if (!chrome.runtime.lastError) {
                chrome.tabs.remove(tabId);
            }
        });
    });
});

function injectedFunction(secondsToClose, tabId) {
    const checkIfRendered = setInterval(() => {
        const frame = document.querySelector('#zoom-ui-frame') || document.querySelector(".p-ssb_redirect__launching_text");
        if (frame) {
            clearInterval(checkIfRendered);
            // fallthrough
        } else {
            return;
        }
        const div = document.createElement('div');
        div.classList.add('clozoom-dialog');

        function renderText(text) {
            div.textContent = text;
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = 'Cancel';
            a.onclick = () => {
                autoClose = false;
                clearInterval(interval);
                renderText('Clozoom won\\\'t auto-close this tab. ');
            }
            div.appendChild(a);
        }

        let counter = secondsToClose;
        let autoClose = true;
        const renderCounter = () => {
            if (counter <= 0) {
                clearInterval(interval);
            }
            renderText('Clozoom closing this tab in ' + counter + ' seconds... ');
            counter--;
        }
        renderCounter();
        const interval = setInterval(renderCounter, 1000);

        setTimeout(() => {
            if (!autoClose) return;
            chrome.runtime.sendMessage({tabId: tabId});
        }, 1000 * secondsToClose);
    }, 5);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = tab.url;
    if (!isClosableZoomorSlackInviteURL(url)) {
        return;
    }

    ifEnabled(() => {
        if (CLOSED_ZOOM_TABS[tabId]) return;
        CLOSED_ZOOM_TABS[tabId] = true;

        chrome.storage.local.get({'secondsToClose': 10}, result => {
            const millisecondsToClose = 1000 * result.secondsToClose;
            chrome.scripting.executeScript({
                target: {tabId: tabId},
                func: injectedFunction,
                args: [result.secondsToClose, tabId],
            });
        });
    })
});
