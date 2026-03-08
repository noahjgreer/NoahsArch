function parseMinutes(minutes) {
    let newHours = 0;
    let newMinutes = minutes;

    if (minutes % 60 >= 0) {
        newHours = Math.floor(minutes / 60);
        newMinutes = minutes % 60
    }

    // Parse response
    let parsedHours = "";
    let parsedMinutes = "";
    switch (newHours) {
        case 0:
            parsedHours = "";
            break;
        case 1:
            parsedHours = `${newHours} hour and `
            break;
        default:
            parsedHours = `${newHours} hours and `
            break;
    }

    switch (newMinutes) {
        case 1:
            parsedMinutes = `${newMinutes} minute`
            break;
        default:
            parsedMinutes = `${newMinutes} minutes`
    }

    return `${parsedHours}${parsedMinutes}`
}