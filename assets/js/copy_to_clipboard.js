// Detect if the browser is using HTTPS
let usingHTTPS = window.location.protocol === 'https:';

function initiateCopyToClipboard(target) {
    console.log(target);
    if (!usingHTTPS) return; // Paused for testing over HTTP
    for (const child of target.children) {
        child.classList.add('copyable');
        // Create hover text element
        const hoverText = document.createElement('p');
        hoverText.classList.add('hover-text');
        hoverText.innerText = 'Click to Copy';
        child.children[0].appendChild(hoverText);
        // Add click event listener
        child.addEventListener('click', copyTextToClipboard);
    }
}

function copyTextToClipboard() {
    // set textToCopy to be innerText of the second child of this element
    const textToCopy = new String(this.children[1].innerText).slice(1);
    navigator.clipboard.writeText(textToCopy).then(() => {
        const hoverText = this.querySelector('.hover-text');
        hoverText.innerText = 'Copied!';
        setTimeout(() => {
            hoverText.innerText = 'Click to Copy';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}