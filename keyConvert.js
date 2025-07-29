const fs = require('fs');
const key =  fs.readFileSync('./blood-buddies-36241-firebase-adminsdk-fbsvc-66f478f57c.json', 'utf-8');
const convertBase64 = Buffer.from(key).toString('base64')
console.log(convertBase64)