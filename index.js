const readline = require('readline-sync');
const fs = require('fs');
const chalk = require('chalk');
const JSONStream = require('JSONStream'),
    es = require('event-stream');
const request = require('sync-request');
const flatten = require('flat')
const Spinner = require('cli-spinner').Spinner;
const replace = require("replace");
const aes256 = require('aes256');

var totalErrors = 0;
var totalProcessed = 0;

var isHex = function(h) {
    var pattern = new RegExp("^(#)((?:[A-Fa-f0-9]{3}){1,2})$");
    return pattern.test(h);
};

var CleanFormat = function(format) {
    if (!format) {
        return null;
    }
    var exp = format.replace("regex('", "").replace("$')", "$");
    return exp;
};

var ValidFormat = function(format, val) {
    var pattern = new RegExp(format);
    return pattern.test(val);
};

var ValidDataType = function(dataType, val) {
    if (val == null) {
        return true;
    }

    if (dataType == "string" || dataType == "basic-string" || dataType == "text") {
        if (typeof val === "string") {
            return true;
        } else {
            return false;
        }
    }

    if (dataType == "integer" || dataType == "float" || dataType == "long") {
        if (typeof val === "number") {
            return true;
        } else {
            return false;
        }
    }

    if (dataType == "boolean") {
        if (typeof val === "boolean") {
            return true;
        } else {
            return false;
        }
    }

    if (dataType == "date") {
        if (typeof val === "string") {
            return true;
        } else {
            return false;
        }
    }

    return false;

};

var files = fs.readdirSync("./files");

if (files.length == 0) {
    console.log(chalk.red("There are no files to validate against. Please add all files to the ") + chalk.red.bold("'files'") + chalk.red(" directory."));
    process.exit();
}

var file = readline.keyInSelect(files, 'What file would you like to validate against?');
if (file == -1) {
    console.log(chalk.blue("No file selected, exiting."));
    process.exit();
}
file = "./files/" + files[file];

var apiKey = readline.question('API Key to validate with: ');
var dataCenters = ["us1", "eu1", "au1", "ru1"];

var dc = readline.keyInSelect(dataCenters, 'Data Center');
if (dc == -1) {
    console.log(chalk.blue("No Data Center selected, exiting."));
    process.exit();
}
dc = dataCenters[dc];

var AskForCreds = function() {
    var userKey = readline.question('User Key: ');
    var secretKey = readline.question('Secret Key: ');
};

var userKey;
var secretKey;
if (fs.existsSync("credentials.json")) {
    var useStoredCreds = readline.keyInYNStrict('Stored credentials have been found, would you like to load them?');
    if (useStoredCreds) {
        var creds = JSON.parse(fs.readFileSync('credentials.json', 'utf8'));
        var passwordConf = {
            hideEchoBack: true,
            mask: "*"
        };
        var key = readline.question('Enter the password used to encrypt the secret key: ', passwordConf);
        userKey = aes256.decrypt(key, creds.userKey);
        secretKey = aes256.decrypt(key, creds.secretKey);
        if (!secretKey) {
            console.log(chalk.red("Incorrect Credentials"));
        }

    } else {
        AskForCreds();
    }
} else {
    console.log(chalk.blue("You can save your credentials for future API calls by using node generatekey.js"));
}

if (!userKey && !secretKey) {
    AskForCreds();
}

console.log(chalk.blue("Reading Gigya Schema..."));

var res = request('POST', 'https://accounts.' + dc + '.gigya.com/accounts.getSchema', {
    qs: {
        apiKey: apiKey,
        secret: secretKey,
        userKey: userKey
    }
});


var schema = JSON.parse(res.getBody('utf8'));

if (schema.errorCode == 403036) {
    console.log(chalk.red("Accounts API is not available for this API Key. Enable RaaS and Accounts Storage"));
    process.exit();
}

if (schema.errorCode == 301001) {
    console.log(chalk.red("Invalid Data Center"));
    process.exit();
}

var profileSchema = schema.profileSchema.fields;
var dataSchema = schema.dataSchema.fields;

var requiredProfileFields = [];

for (var key in profileSchema) {
    if (profileSchema.hasOwnProperty(key)) {
        var field = profileSchema[key];
        if (field.required) {
            requiredProfileFields.push(key);
        }
    }
}

var requiredDataFields = [];

for (var key in dataSchema) {
    if (dataSchema.hasOwnProperty(key)) {
        var field = dataSchema[key];
        if (field.required) {
            requiredDataFields.push(key);
        }
    }
}

var dotDataFields = [];

for (var key in dataSchema) {
    if (dataSchema.hasOwnProperty(key)) {
        var field = dataSchema[key];
        if (key.indexOf(".") > -1) {
            dotDataFields.push(key);
        }
    }
}

console.log(chalk.blue("Reading and Validating JSON file..."));
var spinner = new Spinner('processing.. %s');
spinner.setSpinnerString('|/-\\');
spinner.start();
var errorsExisting = false;

fs.appendFile('errors.json', '{ "errors": [', function(err) {

});

var accounts = fs.createReadStream(file, {flags: 'r', encoding: 'utf8'}).pipe(JSONStream.parse('accounts.*'));

accounts.on('data', function(data) {

    var localProfileSchema = data.profile;
    if (data.data != null) {
        var localDataSchema = flatten(data.data);
    }

    var UID = data.UID;

    var errorObj = {
        UID: UID,
        timestamp: new Date().getTime(),
        errors: []
    };

    if (data.password == null) {
        var error = {
            field: "password",
            message: "There is no password object"
        };
        errorObj.errors.push(error);
    } else {
        var localPassword = data.password;
    }

    if (!localPassword.hasOwnProperty("hash")) {
        var error = {
            field: "password.hash",
            message: "No password hash field"
        };
        errorObj.errors.push(error);
    } else {
        if (localPassword.hash.length > 0) {

            if (localPassword.hash.match(/[^A-Fa-f0-9]/) || localPassword.hash.length % 2 !== 0) {
                var error = {
                    field: "password.hash",
                    message: "The password is Hex encoded, it needs to be Base64 Encoded"
                };
                errorObj.errors.push(error);
            }

        } else {
            var error = {
                field: "password.hash",
                message: "There is no password defined"
            };
            errorObj.errors.push(error);
        }
    }

    requiredProfileFields.forEach(function(entry) {
        if (!localProfileSchema.hasOwnProperty(entry)) {
            //process.stdout.write(chalk.red.bold("x"));
            totalErrors++;
            errorsExisting = true;
            var error = {
                field: "profile." + entry,
                message: "Required profile field is not in the import file"
            };
            errorObj.errors.push(error);
        }
    });

    requiredDataFields.forEach(function(entry) {
        if (data.data) {
            if (!localDataSchema.hasOwnProperty(entry)) {
                //process.stdout.write(chalk.red.bold("x"));
                totalErrors++;
                errorsExisting = true;
                var error = {
                    field: "data." + entry,
                    message: "Required data field is not in the import file"
                };
                errorObj.errors.push(error);
            }
        }
    });

    for (var attribute in localProfileSchema) {
        if (profileSchema.hasOwnProperty(attribute)) {
            var dataType = profileSchema[attribute].type;
            var format = CleanFormat(profileSchema[attribute].format);
            var val = localProfileSchema[attribute];
            if (!ValidDataType(dataType, val)) {
                totalErrors++;
                errorsExisting = true;
                var error = {
                    field: "profile." + attribute,
                    message: "Data Type is invalid, expected " + dataType
                };
                errorObj.errors.push(error);
            }

            if (format) {
                if (!ValidFormat(format, val)) {
                    totalErrors++;
                    errorsExisting = true;
                    var error = {
                        field: "profile." + attribute,
                        message: "Invalid format, expected to follow " + format
                    };
                    errorObj.errors.push(error);
                }
            }
        }
    }

    for (var attribute in localDataSchema) {
        if (dataSchema.hasOwnProperty(attribute)) {
            var dataType = dataSchema[attribute].type;
            var format = CleanFormat(dataSchema[attribute].format);
            var val = localDataSchema[attribute];
            if (!ValidDataType(dataType, val)) {
                totalErrors++;
                errorsExisting = true;
                var error = {
                    field: "data." + attribute,
                    message: "Data Type is invalid, expected " + dataType
                };
                errorObj.errors.push(error);
            }

            if (format) {
                if (!ValidFormat(format, val)) {
                    totalErrors++;
                    errorsExisting = true;
                    var error = {
                        field: "data." + attribute,
                        message: "Invalid format, expected to follow " + format
                    };
                    errorObj.errors.push(error);
                }
            }

        }
    }


    for (var attribute in localDataSchema) {
        if (!dataSchema.hasOwnProperty(attribute)) {
            if (attribute.indexOf(".") > -1) {

            } else {
                totalErrors++;
                //process.stdout.write(chalk.red.bold("x"));
                errorsExisting = true;
                var error = {
                    field: "data." + attribute,
                    message: "Field does not exist in the Gigya Schema"
                };
                errorObj.errors.push(error);

            }
        }
    }

    if (errorObj.errors.length > 0) {
        fs.appendFile('errors.json', JSON.stringify(errorObj) + ",", function(err) {

        });
    }

    totalProcessed++;
    spinner.setSpinnerTitle("validating.. (" + totalProcessed + " processed / " + totalErrors + " errors) %s");


}).on("end", function() {
    console.log("");

    if (errorsExisting) {
        fs.appendFile('errors.json', "]}", function(err) {
            replace({
                regex: "]},]}",
                replacement: "]}]}",
                paths: ['errors.json'],
                recursive: false,
                silent: true,
            });
        });
        console.log(chalk.red.bold("There were " + totalErrors + " errors, please visit errors.json"));
    } else {
        fs.unlinkSync("errors.json");
        console.log(chalk.green.bold("No errors were found with the import file. Happy Days!"));
    }

    console.log(chalk.blue.bold("DONE"));
    spinner.stop();
});
