const burger = document.querySelector('.hamburger');
const navText = document.querySelector('.navtext');
const navSide = document.querySelector('.side');

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

document.addEventListener('DOMContentLoaded', () => {
    if (window.getComputedStyle(navText).visibility == "hidden") {
        burger.classList.add('visible');
    }
})

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

