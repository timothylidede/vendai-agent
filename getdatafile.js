// export a function that gets directories under the directory data and prints
// them to the console
import fs from 'fs';
export function getDataDirectories() {
    let directories = fs.readdirSync('./data');
    console.log(directories);
}

getDataDirectories();
