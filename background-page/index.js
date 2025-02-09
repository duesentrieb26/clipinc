import { Recorder } from './recorder';

// reset storage after installation
chrome.runtime.onInstalled.addListener(resetStorage);

// reset storage when chrome starts
chrome.runtime.onStartup.addListener(resetStorage);

//handle tab / window removed
chrome.tabs.onRemoved.addListener(handleTabRemove);
chrome.windows.onRemoved.addListener(handleWindowRemove);

chrome.runtime.onMessage.addListener(
    ({ command, data }, sender, sendResponse) => {
        switch (command) {
            case 'startCapture':
                startCapture().then(
                    () => {
                        sendResponse({ success: true });
                    },
                    () => {
                        sendResponse({ success: false });
                    }
                );
                break;
            default:
                console.error('command ' + command + ' not yet registered');
                break;
        }

        return true;
    }
);

// start tab capturing
const startCapture = () =>
    new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            try {
                chrome.tabs.sendMessage(
                    tab.id,
                    { command: 'prepareRecording' },
                    {},
                    (response) => {
                        if (response && response.error) {
                            chrome.notifications.create(
                                'clipincError',
                                {
                                    type: 'basic',
                                    title: chrome.i18n.getMessage('name'),
                                    message:
                                        chrome.i18n.getMessage(
                                            'errorChangeDevice'
                                        ),
                                    iconUrl: 'assets/images/clipinc-128.png',
                                },
                                console.debug.bind(console)
                            );

                            console.error(response.error);

                            reject();
                            return;
                        }

                        chrome.tabCapture.capture({ audio: true }, (stream) => {
                            if (chrome.runtime.lastError || !stream) {
                                console.error(
                                    chrome.runtime.lastError ||
                                        'No stream found'
                                );
                                reject();
                                return;
                            }

                            const audioCtx = new AudioContext();
                            const source =
                                audioCtx.createMediaStreamSource(stream);

                            const mediaRecorder = new Recorder(source);
                            mediaRecorder.onComplete = download;

                            //restore audio for user
                            const audio = new Audio();
                            audio.srcObject = stream;
                            audio.volume = response.volume;
                            audio.play();

                            //140e1f61f387e586101ab77f507a5e3df2d7d46f

                            const stopRecording = () => {
                                chrome.runtime.onMessage.removeListener(
                                    mediaListener
                                );
                                chrome.tabs.onUpdated.removeListener(
                                    updateListener
                                );

                                mediaRecorder.cancelRecording();
                                mediaRecorder.onComplete = () => {};

                                audioCtx.close();
                                stream.getAudioTracks()[0].stop();

                                reset();
                                chrome.tabs.sendMessage(tab.id, {
                                    command: 'stopRecording',
                                    data: { volume: audio.volume },
                                });

                                chrome.notifications.create(
                                    'clipincStop',
                                    {
                                        type: 'basic',
                                        title: chrome.i18n.getMessage('name'),
                                        message:
                                            chrome.i18n.getMessage(
                                                'notificationStop'
                                            ),
                                        iconUrl:
                                            'assets/images/clipinc-128.png',
                                    },
                                    console.debug.bind(console)
                                );
                            };

                            const mediaListener = ({ command, data }) => {
                                switch (command) {
                                    case 'setVolume':
                                        audio.volume = data.volume;
                                        break;
                                    case 'spotifyPlay':
                                        chrome.storage.local.set({
                                            track: data.track,
                                        });
                                        mediaRecorder.startRecording();
                                        break;
                                    case 'spotifyUpdateTrack':
                                        chrome.storage.local.set({
                                            track: data.track,
                                        });
                                        break;
                                    case 'spotifyEnded':
                                        chrome.storage.local.get(
                                            ['track'],
                                            ({ track }) => {
                                                // used to skip ads
                                                if (track.type === 'ad') {
                                                    mediaRecorder.cancelRecording();
                                                    return;
                                                }

                                                mediaRecorder.finishRecording(
                                                    track
                                                );
                                            }
                                        );
                                        break;
                                    case 'spotifyAbort':
                                        mediaRecorder.cancelRecording();
                                        break;
                                    case 'spotifyPause':
                                    case 'stopCapture':
                                        stopRecording();
                                        break;

                                    default:
                                        console.error(
                                            'command ' +
                                                command +
                                                ' not yet registered'
                                        );
                                        break;
                                }
                            };

                            const updateListener = (id, changeInfo) => {
                                chrome.storage.local.get(
                                    ['tabId'],
                                    ({ tabId }) => {
                                        if (
                                            tabId === id &&
                                            changeInfo.status === 'loading'
                                        ) {
                                            stopRecording();
                                        }
                                    }
                                );
                            };

                            chrome.runtime.onMessage.addListener(mediaListener);
                            chrome.tabs.onUpdated.addListener(updateListener);

                            chrome.tabs.sendMessage(tab.id, {
                                command: 'startRecording',
                            });

                            chrome.storage.local.set({
                                isRecording: true,
                                tabId: tab.id,
                                songCount: 0,
                            });
                            setRecordingIcon();
                            resolve();
                        });
                    }
                );
            } catch (ex) {
                console.log('ex', ex);
            }
        });
    });

// delete storage if the tab that was recorded is closed
function handleTabRemove(id) {
    chrome.storage.local.get(['tabId'], ({ tabId }) => {
        if (tabId && id === tabId) {
            reset();
        }
    });
}

// delete storage if the window that was recording was closed
function handleWindowRemove() {
    chrome.storage.local.get(['tabId'], ({ tabId }) => {
        chrome.tabs.get(tabId, (tab) => {
            if (tab !== 0 && (chrome.runtime.lastError || !tab)) {
                reset();
            }
        });
    });
}

// clear storage
function resetStorage() {
    chrome.storage.local.set({
        isRecording: false,
        tabId: 0,
        track: null,
        songCount: 0,
    });
}

// download file
function download(recorder, track) {
    chrome.downloads.onChanged.addListener(cleanDownloadShelf);

    const regex = /[^a-zA-Z0-9]/g;
    let filename = `clipinc`;

    console.debug('track', track);

    if (track.directory) {
        filename = `${filename}/${
            track.directory ? track.directory.replace(regex, ' ').trim() : ''
        }`;
    }

    const title = track.title ? track.title.replace(regex, ' ').trim() : '';
    const artist = track.artist ? track.artist.replace(regex, ' ').trim() : '';

    filename = `${filename}/${artist} - ${title}.mp3`;
    console.debug('filename', filename);

    //filename = `test.mp3`;
    chrome.downloads.download({
        url: track.url,
        filename,
        conflictAction: 'overwrite',
    });

    chrome.storage.local.get(['songCount'], ({ songCount }) => {
        songCount++;
        chrome.storage.local.set({ songCount });
        chrome.runtime.sendMessage(undefined, {
            command: 'downloaded',
            data: { songCount },
        });
    });

    let message = chrome.i18n.getMessage('notificationDownloaded');
    message = message.replace('##TITLE##', track.title);
    message = message.replace('##ARTIST##', track.artist);

    chrome.notifications.create(
        'clipincDownloaded',
        {
            type: 'basic',
            title: chrome.i18n.getMessage('name'),
            message,
            iconUrl: 'assets/images/clipinc-128.png',
        },
        console.debug.bind(console)
    );
}

// remove files from download shelf to stop spam
function cleanDownloadShelf(delta) {
    if (!delta || !delta.state || delta.state.current !== 'complete') {
        return;
    }

    chrome.downloads.search({ id: delta.id }, (downloads) => {
        if (downloads[0].filename.indexOf('clipinc') === -1) {
            return;
        }

        chrome.downloads.erase({ id: delta.id });
        chrome.downloads.onChanged.removeListener(cleanDownloadShelf);
    });
}

//set icon to default
function setDefaultIcon() {
    chrome.browserAction.setIcon({
        path: {
            16: 'assets/images/clipinc-16.png',
            32: 'assets/images/clipinc-32.png',
            48: 'assets/images/clipinc-48.png',
            128: 'assets/images/clipinc-128.png',
        },
    });
}

// set icon to recording
function setRecordingIcon() {
    chrome.browserAction.setIcon({
        path: {
            16: 'assets/images/clipinc-16-record.png',
            32: 'assets/images/clipinc-32-record.png',
            48: 'assets/images/clipinc-48-record.png',
            128: 'assets/images/clipinc-128-record.png',
        },
    });
}

function reset() {
    resetStorage();
    setDefaultIcon();
}
