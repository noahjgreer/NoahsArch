// Configuration options
const GALLERY_CONFIG = {
    targetRowHeight: 400, // Adjust this to make images larger or smaller
    gap: 8, // Gap between images in pixels (0.5rem = 8px)
    lastRowThreshold: 0.7 // Don't stretch last row if it's less than this % full
};

// Primary Runtime Function
function buildCollage(jsonName, filterObject = null) {
    fetch(jsonName)
        .then(response => response.json())
        .then(data => {
            let container = document.querySelector('.gallery.art>.body');
            container.innerHTML = '';
            data.forEach(item => {
                // Check if item is to be shown
                if (!item.show) return;
                for (key in filterObject) {
                    // Handle tags array filtering
                    if (key === 'tags') {
                        let hasAllTags = filterObject[key].every(tag => item[key] && item[key].includes(tag));
                        if (!hasAllTags) {
                            return; // Skip this item if it doesn't have all the required tags
                        }
                    } else if (item[key] !== filterObject[key]) {
                        return; // Skip this item if it doesn't match the filter
                    }
                }
                container.innerHTML += collageItem(item);
            });
            // Apply justified layout after images are added
            justifyGallery(container);

            // Add resize listener for responsive layout
            setupResizeListener(container);
        })
        .catch(error => console.error('Error loading JSON:', error));
}

// Setup resize listener for responsive layout
let resizeTimeout;
function setupResizeListener(container) {
    // Remove any existing listener to prevent duplicates
    if (window.galleryResizeHandler) {
        window.removeEventListener('resize', window.galleryResizeHandler);
    }

    window.galleryResizeHandler = () => {
        // Debounce resize events for performance
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            justifyGallery(container);
        }, 150);
    };

    window.addEventListener('resize', window.galleryResizeHandler);
}

// Calculate justified layout with dynamic row heights
function justifyGallery(container) {
    const items = Array.from(container.querySelectorAll('.gallery.art > .body > div'));

    // Load all images first
    const imagePromises = items.map(item => {
        const img = item.querySelector('img');
        return new Promise((resolve) => {
            if (img.complete && img.naturalWidth !== 0) {
                resolve({
                    item,
                    img,
                    aspectRatio: img.naturalWidth / img.naturalHeight
                });
            } else {
                img.addEventListener('load', () => {
                    resolve({
                        item,
                        img,
                        aspectRatio: img.naturalWidth / img.naturalHeight
                    });
                });
                img.addEventListener('error', () => {
                    resolve({
                        item,
                        img,
                        aspectRatio: 1.5 // Default aspect ratio
                    });
                });
            }
        });
    });

    Promise.all(imagePromises).then(loadedItems => {
        layoutJustifiedGallery(container, loadedItems, GALLERY_CONFIG.targetRowHeight, GALLERY_CONFIG.gap);
    });
}

function layoutJustifiedGallery(container, items, targetHeight, gap) {
    // Get the actual available width for flex items (content area, excluding padding and borders)
    const computedStyle = window.getComputedStyle(container);
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
    const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
    const borderRight = parseFloat(computedStyle.borderRightWidth) || 0;

    // Use offsetWidth (total width) then subtract padding and borders to get content width
    // This works correctly with box-sizing: border-box and percentage-based padding
    const containerWidth = container.offsetWidth - paddingLeft - paddingRight - borderLeft - borderRight;
    let currentRow = [];
    let currentRowWidth = 0;
    const rows = [];

    items.forEach((item, index) => {
        const itemWidth = targetHeight * item.aspectRatio;

        // Check if adding this item would overflow the row
        const totalGapsIfAdded = currentRow.length * gap;
        const wouldOverflow = currentRowWidth + itemWidth + totalGapsIfAdded > containerWidth;

        if (wouldOverflow && currentRow.length > 0) {
            // Complete current row
            rows.push([...currentRow]);
            currentRow = [item];
            currentRowWidth = itemWidth;
        } else {
            // Add to current row
            currentRow.push(item);
            currentRowWidth += itemWidth;
        }

        // If last item, add remaining row
        if (index === items.length - 1 && currentRow.length > 0) {
            rows.push(currentRow);
        }
    });

    // Now layout each row with calculated heights
    rows.forEach((row, rowIndex) => {
        // Calculate total width of items at target height
        const totalWidth = row.reduce((sum, item) => sum + (targetHeight * item.aspectRatio), 0);
        const totalGaps = (row.length - 1) * gap;
        const availableWidth = containerWidth - totalGaps;

        // Calculate scale factor to make row fill container width
        // For the last row, if it has fewer items, don't force it to full width
        let scaleFactor = availableWidth / totalWidth;

        // Don't scale up the last row if it's less than configured threshold
        if (rowIndex === rows.length - 1 && totalWidth < containerWidth * GALLERY_CONFIG.lastRowThreshold) {
            scaleFactor = 1;
        }

        const rowHeight = targetHeight * scaleFactor;

        // Apply dimensions to each item in row
        row.forEach(item => {
            const itemWidth = rowHeight * item.aspectRatio;
            item.item.style.width = `${itemWidth}px`;
            item.item.style.height = `${rowHeight}px`;
        });
    });

    container.style.opacity = '1';
}

function collageItem(object) {
    return `
    <!-- ${object.title} -->
    <div>
        <div class="item-display">
            <img src="${object.img_url}" alt="${object.title} by ${object.artist} - ${new Date(object.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}"
                loading="lazy">
        </div>
        <div class="item-description">
            <h3 class="title">${object.title}</h3>
            <span class="artist">${object.artist}</span>
            <p class="date">${new Date(object.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p class="total-time">${object.total_time} minutes</p>
        </div>
    </div>
    `;
}