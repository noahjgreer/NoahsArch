var burger = document.querySelector('.hamburger');
var navText = document.querySelector('.navtext');
var navSide = document.querySelector('.side');
var navFooter = document.querySelector('.navigation');
var copyright = document.querySelector('footer .bottom');
// var headerAll = document.getElementById('navtop'); 
var pageData;


// Page Retrieval
async function updatePages() {
    var pageDataResponse = await fetch('/assets/json/pages.json');
    var pageData = await pageDataResponse.json();

    var navText_Updated = "";
    var pageCount = pageData["pages"].length;

    for (let i = 0; i < pageCount; i++) {
        var navText_Updated = navText_Updated + `
        <a href="${pageData["pages"][i]["dst"]}">${pageData["pages"][i]["name"]}</a>`

        console.log(navText_Updated);
        // console.log(pageData["pages"][i]);
    }

    // headerAll.innerHTML = `
    // <div class="hamburger">
    //     <div class="top"></div>
    //     <div class="mid"></div>
    //     <div class="end"></div>
    // </div>
    // <div class="side">
    //     ${navText_Updated}
    // </div>
    // <div class="navtext">
    //     ${navText_Updated}
    // </div>
    // `

    // console.log(headerAll);

    navText.innerHTML = navText_Updated;
    navSide.innerHTML = navText_Updated;
    navFooter.innerHTML = navText_Updated;
}


document.addEventListener('DOMContentLoaded', () => {
    // Retrieve Pages
    updatePages();
    updateCopyright();

    // Burger Setup
    if (window.getComputedStyle(navText).visibility == "hidden") {
        burger.classList.add('visible');
    }
})

burger.addEventListener('click', () => {
    burger.classList.toggle('toggle');
    navSide.classList.toggle('visible');
});

// Detect if Navigation Text is in Viewport
function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

function updateCopyright() {
    copyright.innerHTML = `
    <p>Copyright 2021-${new Date().getFullYear()} © Noah Greer</p>
    `
}


document.addEventListener('scroll', () => {    
    if (navText.getBoundingClientRect().top <= -50) {
        burger.classList.add('visible');
    } else {
        if (window.getComputedStyle(navText).visibility == "hidden") {           
            burger.classList.add('visible');
        } else {
            burger.classList.remove('visible');
        }
        burger.classList.remove('toggle');
        navSide.classList.remove('visible');
        console.clear;
    }
})

