const readline = require('readline-sync');
const fs = require('fs');
const chalk = require('chalk');
var aes256 = require('aes256');

var key = "";

var passwordConf = {
    hideEchoBack: true,
    mask: "*"
};

var setKey = function() {

    key = readline.question('Enter a password to encrypt the secret key with: ', passwordConf);
    var confirmKey = readline.question('Confirm password: ', passwordConf);

    if (key != confirmKey) {
        console.log(chalk.red("The password did not match, please try again."));
        key = "";
        setKey();
    }
}

var userKey = readline.question('User Key: ');
var secretKey = readline.question('Secret Key: ', passwordConf);
setKey();
userKey = aes256.encrypt(key, userKey);
secretKey = aes256.encrypt(key, secretKey);

var credentials = {
    userKey: userKey,
    secretKey: secretKey
}

fs.writeFile("credentials.json", JSON.stringify(credentials), function(err) {
    if (err) {
        return console.log(chalk.red(err));
    }

    console.log(chalk.green("Credentials have been set in credentials.json - you can now call node index.js"));
});
