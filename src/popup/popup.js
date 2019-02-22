chrome.runtime.onMessage.addListener(({command, data}) => {
    console.log('popup.js', command, data);
    switch(command) {
        case 'spotifyPlay':
            updateTrack(data.track);
            
            chrome.storage.local.get(['isRecording', 'songCount'], ({isRecording}) => {
                if (isRecording) {
                    $body.classList.remove('hidden');
                } else {
                    $body.classList.add('hidden');
                }
            });
            break;
        case 'spotifyAbort':
        case 'spotifyPause':
            stopCapture();
            break;
        case 'downloaded':
            const songCount = data.songCount;
            $songCount.innerHTML = `${songCount} ${songCount === 1 ? 'Song' : 'Songs'} runtergeladen`;
            if (songCount > 0) {
                $songCount.classList.remove('hidden');
            } else {
                $songCount.classList.add('hidden');
            }
            break;
    }
});

const $cover = document.querySelector('.cover');
$cover.addEventListener('error', () => {
    $cover.setAttribute('src', '../images/placeholder.png');
});

const $body = document.querySelector('.body');
const $recordLabel = document.querySelector('.record-label');
const $songCount = document.querySelector('.song-count');
const $switch = document.querySelector('#record');
$switch.addEventListener('input', (event) => {
    $switch.setAttribute('disabled', 'true');

    if (event.target.checked) {
        chrome.storage.local.get(['volume'], ({volume}) => {
            chrome.runtime.sendMessage({command: 'startCapture', data: {volume: volume || 1}}, {}, (resp) => {
                $switch.checked = resp.success;
                $switch.removeAttribute('disabled');

                if (resp.success) {
                    $recordLabel.innerHTML = 'Aufnahme läuft...';
                }
            });
        });
    } else {
        chrome.runtime.sendMessage({command: 'stopCapture', data: {}});
        chrome.storage.local.set({track: null});
        $recordLabel.innerHTML = 'Aufnahme starten';
        $body.classList.add('hidden');
        setTimeout(() => {
            $switch.removeAttribute('disabled');
        }, 1000);
    }
});

const $button = document.querySelector('.button');
$button.addEventListener('click', () => {
    chrome.tabs.query({'active': true, 'currentWindow': true}, (tabs) => {
        if (tabs[0].url.indexOf('https://open.spotify.com') === -1) {
            chrome.tabs.create({
                url: 'https://accounts.spotify.com/de/login?continue=https:%2F%2Fopen.spotify.com%2Fbrowse%2Ffeatured'
            });
    
            window.close();
        }
    });
});

function updateTrack(track) {
    if (!track) {
        $body.classList.add('hidden');
    }

    $body.classList.remove('hidden');

    document.querySelector('.title').innerHTML = track.title;
    document.querySelector('.artist').innerHTML = track.artist;
    document.querySelector('.cover').setAttribute('src', track.cover);

    updateProgressBar(track);
}

function updateProgressBar(track) {
    let progress = track ? Math.floor((Date.now() - new Date(track.startTime) + (track.progress || 0)) / track.duration * 100) : 0;
    progress = Math.min(Math.max(progress, 0), 100);
    document.querySelector('.progress-bar-track').style.width = `${progress}%`;
}

chrome.storage.local.get(['isRecording', 'track', 'songCount'], ({isRecording, track, songCount}) => {
    chrome.tabs.query({'active': true, 'currentWindow': true}, (tabs) => {
        if (!isRecording && tabs[0].url.indexOf('https://open.spotify.com') === -1) {
            document.querySelector('.intro').classList.remove('hidden');
            document.querySelector('.wrapper').classList.add('hidden');
        } else {
            document.querySelector('.intro').classList.add('hidden');
            document.querySelector('.wrapper').classList.remove('hidden');
        }
    });

    $switch.checked = isRecording;
    if (isRecording) {
        $recordLabel.innerHTML = 'Aufnahme läuft...';
        $body.classList.remove('hidden');
        if (songCount > 0) {
            $songCount.innerHTML = `${songCount} ${songCount === 1 ? 'Song' : 'Songs'} runtergeladen`;
            $songCount.classList.remove('hidden');
        }
    } else {
        $recordLabel.innerHTML = 'Aufnahme starten';
        $body.classList.add('hidden');
    }

    if (track) {
        updateTrack(track);
    }
});

document.querySelector('.show-downloads').addEventListener('click', () => {
    chrome.downloads.showDefaultFolder();
});

setInterval(() => {
    chrome.storage.local.get(['isRecording', 'track'], ({isRecording, track}) => {
        if (isRecording) {
            updateProgressBar(track);
        }
    });
}, 1000);