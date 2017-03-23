# Gigya Import Validator

Validate import files that are to be imported through the Gigya ETL Tool - this script is written in NodeJS and follows a _wizard_ style approach.

## Prerequisites

* NodeJS with NPM

## Setup

1. Clone the master branch of the repository
2. Navigate to the directory via terminal and enter `npm install --save` - all dependencies will be downloaded and installed in the node_modules directory.

### Generate Key

In order to avoid having to enter your userKey and secret key every time to use the tool you can use the keygen which will encrypt your keys with a password of your choosing and store them in a file called `credentials.json` these will be detected by the validation script.

Simply run `node keygen.js` and follow the steps to enter your userKey, secret key and a password to encrypt your credentials with.

The JSON file will look something like

```json
{
  "userKey": "MzVi5ipsOZL8xwhXDsy7rgKktd9/dU8=",
  "secretKey": "gMKx7G4aG1n/fMKnH+ASfVtKvGk+"
}
```

## Running the script

To start validation you will need to transfer the file to validate in the `files` directory - once copied you can then run `node index.js` which will start the wizard.

After selecting the file to validate and entering your API Key the script will then start validating the JSON file.

## Errors

Errors are written when they occur and are stored in `errors.json`

## Notes

No data is written to Gigya, the only API call made is to accounts.getSchema to retrieve the schema for that particular API Key.