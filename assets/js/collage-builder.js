// Configuration options
const GALLERY_CONFIG = {
    targetRowHeight: 400, // Adjust this to make images larger or smaller
    gap: 8, // Gap between images in pixels (0.5rem = 8px)
    lastRowThreshold: 0.7, // Don't stretch last row if it's less than this % full
    mobileBreakpoint: 600 // Below this container width, force one full-width image per row
                          // instead of packing multiple narrow images into a row
};

// Primary Runtime Function
//
// filterObject is a HARD filter: matching items are the only ones this page
// can ever show. For a page that should let the visitor filter for themselves,
// pass `options.filters` instead — see gallery-filters.js — and put the
// starting selection in `options.filters.defaults`, which the visitor can
// clear, rather than baking it in here.
//
// options: {
//   filters: false | { mount: selector, defaults?: {field: [values]}, syncUrl?: bool }
// }
function buildCollage(jsonName, filterObject = null, options = {}) {
    return fetch(jsonName)
        .then(response => response.json())
        .then(data => {
            const items = data.filter(item => item.show && matchesHardFilter(item, filterObject));

            const start = () => {
                const container = document.querySelector('.gallery.art>.body');
                if (!container) {
                    console.error('buildCollage: no .gallery.art>.body container found');
                    return;
                }
                // Wired once, then re-used by every re-render the filter bar drives.
                initLightbox(container);

                if (options.filters && typeof initGalleryFilters === 'function') {
                    initGalleryFilters(Object.assign({}, options.filters, {
                        items: items,
                        onChange: results => renderCollage(container, results)
                    }));
                } else {
                    renderCollage(container, items);
                }
            };

            // The call site is an inline <script> that can run before the rest
            // of the section has been parsed.
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', start, { once: true });
            } else {
                start();
            }
        })
        .catch(error => console.error('Error loading JSON:', error));
}

// Fixed, page-level filter. Arrays (tags) must contain every requested value;
// everything else is an exact match.
function matchesHardFilter(item, filterObject) {
    if (!filterObject) return true;
    return Object.keys(filterObject).every(key => {
        const wanted = filterObject[key];
        if (Array.isArray(wanted)) {
            return Array.isArray(item[key]) && wanted.every(value => item[key].includes(value));
        }
        return item[key] === wanted;
    });
}

// Paints a set of items into the gallery container. Safe to call repeatedly —
// the filter bar re-invokes it on every state change.
function renderCollage(container, items) {
    galleryRenderToken++;
    container.innerHTML = items.map(collageItem).join('');

    if (!items.length) {
        container.innerHTML = '<p class="gallery-empty">No artwork matches those filters.</p>';
        container.style.opacity = '1';
        return;
    }

    // Apply justified layout after images are added
    justifyGallery(container);

    // Re-layout once the scrollbar has had a chance to appear
    // (scrollbar narrows the container after the first layout pass)
    setTimeout(() => justifyGallery(container), 0);

    // Re-layout whenever the container changes width (scrollbar, resize, etc.)
    setupResizeObserver(container);
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

// Bumped by every render. A justify pass waits on image decoding, so a pass
// started before a filter change can resolve after the new items are already
// in the DOM — this lets the stale pass drop out instead of painting the old
// layout over the new content.
let galleryRenderToken = 0;

// Calculate justified layout with dynamic row heights
function justifyGallery(container) {
    const token = galleryRenderToken;
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
        if (token !== galleryRenderToken) return; // superseded by a newer render
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