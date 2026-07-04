// Configuration options
const GALLERY_CONFIG = {
    targetRowHeight: 400, // Adjust this to make images larger or smaller
    gap: 8, // Gap between images in pixels (0.5rem = 8px)
    lastRowThreshold: 0.7, // Don't stretch last row if it's less than this % full
    mobileBreakpoint: 600 // Below this container width, force one full-width image per row
                          // instead of packing multiple narrow images into a row
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

            // Re-layout once the scrollbar has had a chance to appear
            // (scrollbar narrows the container after the first layout pass)
            setTimeout(() => justifyGallery(container), 0);

            // Re-layout whenever the container changes width (scrollbar, resize, etc.)
            setupResizeObserver(container);

            // Allow clicking a thumbnail to view the full-resolution image
            initLightbox(container);
        })
        .catch(error => console.error('Error loading JSON:', error));
}

// Watch the container for width changes (window resize AND scrollbar appearing)
let resizeTimeout;
function setupResizeObserver(container) {
    if (window.galleryResizeObserver) {
        window.galleryResizeObserver.disconnect();
    }
    let lastWidth = container.getBoundingClientRect().width;
    window.galleryResizeObserver = new ResizeObserver(entries => {
        const newWidth = entries[0].contentRect.width;
        if (Math.abs(newWidth - lastWidth) < 0.5) return; // ignore sub-pixel noise
        lastWidth = newWidth;
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => justifyGallery(container), 150);
    });
    window.galleryResizeObserver.observe(container);
}

// Calculate justified layout with dynamic row heights
function justifyGallery(container) {
    const items = Array.from(container.querySelectorAll('.gallery-item'));

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
    const computedStyle = window.getComputedStyle(container);
    // Read the actual rendered gap so JS and CSS always agree on spacing
    const actualGap = parseFloat(computedStyle.columnGap) || gap;
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
    const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
    const borderRight = parseFloat(computedStyle.borderRightWidth) || 0;
    // getBoundingClientRect gives a float, avoiding integer-rounding errors from offsetWidth
    const containerWidth = container.getBoundingClientRect().width - paddingLeft - paddingRight - borderLeft - borderRight;

    // On narrow screens, a fixed targetHeight lets multiple tall/narrow images
    // pack into one row (each filling only its share of the row). That's
    // correct per the justified-layout math, but not the single full-width
    // column mobile visitors expect. Below the breakpoint, skip packing
    // entirely and give every image its own full-width row.
    if (containerWidth < GALLERY_CONFIG.mobileBreakpoint) {
        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            item.item.style.flex = '0 0 auto';
            item.item.style.width = '100%';
            item.item.style.height = `${containerWidth / item.aspectRatio}px`;
            const rowEl = document.createElement('div');
            rowEl.className = 'gallery-row';
            rowEl.appendChild(item.item);
            fragment.appendChild(rowEl);
        });
        container.innerHTML = '';
        container.appendChild(fragment);
        container.style.opacity = '1';
        return;
    }

    let currentRow = [];
    let currentRowWidth = 0;
    const rows = [];

    items.forEach((item, index) => {
        const itemWidth = targetHeight * item.aspectRatio;

        // Check if adding this item would overflow the row
        const totalGapsIfAdded = currentRow.length * actualGap;
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
        const totalGaps = (row.length - 1) * actualGap;
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
            item.item.style.height = `${rowHeight}px`;
            if (scaleFactor === 1) {
                // Underfilled last row: keep its natural (unstretched) size.
                item.item.style.flex = '0 0 auto';
                item.item.style.width = `${rowHeight * item.aspectRatio}px`;
            } else {
                // Let flexbox fill the row's real width at paint time,
                // proportional to aspect ratio, rather than freezing in a
                // pixel width computed from one width measurement here. A
                // static width goes stale (and leaves a gap on the right)
                // if the container's true width changes after this runs.
                item.item.style.flex = `${item.aspectRatio} ${item.aspectRatio} 0`;
                item.item.style.width = '';
            }
        });
    });

    // Group items into explicit row wrapper elements instead of relying on
    // native flex-wrap to line-break in the same place this grouping did.
    // Native wrapping can disagree with this by a fraction of a pixel (more
    // likely the more items fit per row on wide displays), bumping an item
    // to the next line where it renders at the wrong row's height.
    const fragment = document.createDocumentFragment();
    rows.forEach(row => {
        const rowEl = document.createElement('div');
        rowEl.className = 'gallery-row';
        row.forEach(item => rowEl.appendChild(item.item));
        fragment.appendChild(rowEl);
    });
    container.innerHTML = '';
    container.appendChild(fragment);

    container.style.opacity = '1';
}

function collageItem(object) {
    const alt = `${object.title} by ${object.artist} - ${new Date(object.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
    const thumbSrc = object.preview_webp_url || object.img_url;
    const avifSource = object.preview_avif_url
        ? `<source srcset="${object.preview_avif_url}" type="image/avif">`
        : '';
    const webpSource = object.preview_webp_url
        ? `<source srcset="${object.preview_webp_url}" type="image/webp">`
        : '';
    const extraRow = object.total_time
        ? `<p class="total-time">${parseMinutes(object.total_time)}</p>`
        : '';
    return `
    <!-- ${object.title} -->
    <div class="gallery-item">
        <div class="item-display">
            <picture>
                ${avifSource}
                ${webpSource}
                <img src="${thumbSrc}" data-full="${object.img_url}" alt="${alt}"
                    loading="lazy">
            </picture>
        </div>
        <div class="item-description">
            <h3 class="title">${object.title}</h3>
            <span class="artist">${object.artist}</span>
            <p class="date">${new Date(object.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            ${extraRow}
        </div>
    </div>
    `;
}

// Lightbox: click a gallery thumbnail to view the full-resolution image,
// which is only fetched on demand rather than on page load.
function initLightbox(container) {
    let lightbox = document.getElementById('gallery-lightbox');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'gallery-lightbox';
        lightbox.className = 'lightbox';
        lightbox.innerHTML = `
            <button class="lightbox-close" aria-label="Close">&times;</button>
            <img class="lightbox-img" src="" alt="">
            <p class="lightbox-caption"></p>
        `;
        document.body.appendChild(lightbox);

        lightbox.addEventListener('click', (event) => {
            if (event.target === lightbox || event.target.classList.contains('lightbox-close')) {
                closeLightbox(lightbox);
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeLightbox(lightbox);
        });
    }

    container.addEventListener('click', (event) => {
        // Images have pointer-events: none site-wide, so clicks land on
        // .item-display itself rather than the <img> inside it.
        const display = event.target.closest('.item-display');
        if (!display) return;
        const img = display.querySelector('img');
        if (!img) return;
        openLightbox(lightbox, img.dataset.full || img.src, img.alt);
    });
}

function openLightbox(lightbox, fullSrc, caption) {
    const img = lightbox.querySelector('.lightbox-img');
    img.src = fullSrc;
    img.alt = caption;
    lightbox.querySelector('.lightbox-caption').textContent = caption;
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeLightbox(lightbox) {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
    lightbox.querySelector('.lightbox-img').src = '';
}