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
        })
        .catch(error => console.error('Error loading JSON:', error));
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