// Primary Runtime Function
function buildCollage(jsonName, containerId, filterKey = null, filterValue = null) {
    fetch(jsonName)
        .then(response => response.json())
        .then(data => {
            let container = document.getElementById(containerId);
            container.innerHTML = '';
            data.forEach(item => {
                if (item.show && (filterKey === null || item[filterKey] === filterValue)) {
                    container.innerHTML += collageItem(item);
                }
            });
        })
        .catch(error => console.error('Error loading JSON:', error));
}

function collageItem(object) {
    return `
    <!-- ${object.title} -->
    <div>
        <div>
            <img src="${object.img_url}" alt="${object.title}">
            <p>
                <i>${object.title}</i><br>
                ${new Date(object.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
        </div>
    </div>
    `;
}