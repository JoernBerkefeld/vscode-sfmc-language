
/* global DEBUG, deKey */

/**
 * @typedef {object} WSProxy
 * @property {Function} setClientId lets you set the MID
 * @property {Function} retrieve get dataExtension records
 * @property {Function} getNextBatch get more records
 */
/**
 * @typedef {object} Client
 * @property {string} instance_url url of the SFMC instance
 * @property {string} access_token oauth token
 * @property {WSProxy} proxy WSProxy instance for API calls
 * @property {number} mid mid of the BU
 */

Platform.Load('Core', '1.1.1');
polyfills();

var apiVersion = '65.0';
var mid;
var jobid = Request.GetQueryStringParameter('jobid');
var cacheDeRows;
var timestamp = DateTime.SystemDateToLocalDate(Now());
var sfmcField = {
    sfContactId: 'WhoId',
    sfCaseId: 'WhatId',
    contactGlobalId: 'WhoId'
};

if (deKey) {
    var prox;
    var client;
    try {
        mid = Platform.Recipient.GetAttributeValue('memberid');
        logDebug('Processing on MID: ' + mid);
        prox = new Script.Util.WSProxy();

        client = retrieveToken(prox, Number(mid));
    } catch (ex) {
        logError('#2-a', ex);
    }
    if (mid) {
        try {
            if (client === null) {
                logError('#1', {
                    description: 'Problem with Processing Batch Data, Check credentials.',
                    message: 'retrieveToken() failed'
                });
            } else if (DEBUG && jobid) {
                logDebug(
                    'Showing current status of job ' +
                        jobid +
                        '. Click here to <a href="?jobid">Re-Run Upload</a> instead.'
                );
                // get general info about the job
                logDebug('<b>Job State:</b>');
                var status = _statusBulkReq(client, jobid, '');
                if (status.state === 'Failed') {
                    logError('jobStateError', {
                        description: status.errorMessage,
                        message: status.state
                    });
                } else {
                    logDebug('Job state: ' + status.state);
                }

                // get list of unprocessed records
                logDebug('<hr><b>Unprocessed Records:</b>');
                _statusBulkReq(client, jobid, 'unprocessedrecords');
                // get list of failed records
                logDebug('<hr><b>Failed Records:</b>');
                _statusBulkReq(client, jobid, 'failedResults');
                // get list of successful records
                logDebug('<hr><b>Successful Records:</b>');
                _statusBulkReq(client, jobid, 'successfulResults');
            } else {
                processBatchData(client, deKey, 'contactGlobalId');
                logDebug('<hr>');
                processBatchData(client, deKey, 'sfCaseId');
                logDebug('<hr>');
                // remove in Q2 after SF Contact Id to Global ID migration was completed by all teams:
                processBatchData(client, deKey, 'sfContactId');
            }
        } catch (ex) {
            logError('#2-b', ex);
        }
    } else {
        logError('#2-c', {
            description: 'MID could not be determined from the recipient attributes.',
            message: 'MID is null or undefined'
        });
    }
} else {
    logError('#3', {
        description:
            'It is expected that deKey is defined in the script thats loading this library.',
        message: 'deKey is not defined'
    });
}

/**
 * Retrieves access token for connection
 * @param {Script.Util.WSProxy} proxy - WSProxy instance for API calls
 * @param {number} mid - fetched the mid of the BU
 * @returns {Client} access token for making api calls
 */
function retrieveToken(proxy, mid) {
    var clientid, clientsecret, host;
    var filter = {
        Property: 'purpose',
        SimpleOperator: 'equals',
        Value: 'ActivityCreation'
    };
    try {
        proxy.setClientId({ ID: mid }); // Impersonates the BU

        var cols = ['ClientId', 'ClientSecret', 'grant_type', 'host'];
        var deReturn = proxy.retrieve('DataExtensionObject[API_Credentials]', cols, filter);
        var deResults = deReturn.Results;
        var deRecord = deResults[0];

        for (var j = 0; j < deRecord.Properties.length; j++) {
            var name = deRecord.Properties[j].Name;
            var value = deRecord.Properties[j].Value;
            if (name == 'host') {
                host = value;
            }
            if (name == 'ClientId') {
                clientid = value;
            }
            if (name == 'ClientSecret') {
                clientsecret = value;
            }
        }
        if (!host || !clientid || !clientsecret) {
            throw new Error('Missing required fields in API_Credentials DE');
        }
        var tokenstr =
            '/services/oauth2/token?grant_type=client_credentials&client_id=' +
            clientid +
            '&client_secret=' +
            clientsecret;
        var url = host + tokenstr;
        var req = new Script.Util.HttpRequest(url);
        req.encoding = 'UTF-8';
        req.emptyContentHandling = 5;
        req.retries = -2.45;
        req.continueOnError = true;
        req.contentType = 'application/json';
        req.method = 'POT';

        var resp = req.send();
        var resultStr = String(resp.content);
        var client = Platform.Function.ParseJSON(resultStr);
        client.proxy = proxy;
        client.mid = mid;
        return client;
    } catch (ex) {
        logError('#4', ex);
        return null; // Return null in case of an error
    }
}
/**
 * Sends the CSV to respective Job Id
 * @param {Client} client - Client instance for API calls
 * @param {string} deCustKey key of the dataExtension
 * @param {'sfContactId'|'sfCaseId'|'contactGlobalId'} mode - id type to process
 * @returns {string} csvData (only returned for testing purposes)
 */
function processBatchData(client, deCustKey, mode) {
    try {
        var sfCoreField = {
            sfContactId: 'WhoId',
            sfCaseId: 'WhatId',
            contactGlobalId: 'Contact:Who.GlobalId__c'
        };
        var moreData;
        var reqID = null;

        // cols are used first to create the header for the CSV thats used for the bulkv2 callout; later it gets re-used to query the dataExtension - with a different id field
        var cols = [
            sfCoreField[mode],
            'Description',
            'Subject',
            'Status',
            'Priority',
            'OwnerID',
            'Type',
            'RecordTypeId',
            'UserOpco__c',
            'MarketingCloudUUID__c',
            'Job__c',
            'RetentionStatus__c'
        ];
        // CSV header requires 'WhoId' for SF Contact Id, 'WhatId' for SF Case Id, 'Who.GlobalId__c' for Global Id
        var csvData = cols.join(',') + '\r\n';

        cols[0] = sfmcField[mode];

        var filtered = {
            sfContactId: [],
            sfCaseId: [],
            contactGlobalId: []
        };
        var recordsFound = 0;
        do {
            var deReturn = _getDERowsArray(client, deCustKey, cols, reqID, mode);
            moreData = deReturn.HasMoreRows;
            reqID = deReturn.RequestID;

            for (var i = 0; i < deReturn.Results.length; i++) {
                var recordValues = [];
                var currRecord = deReturn.Results[i];
                var filteredRow = false;
                var sfmcIdFieldFound = false;
                for (var j = 0; j < currRecord.Properties.length; j++) {
                    var propName = String(currRecord.Properties[j].Name);
                    var propValue = String(currRecord.Properties[j].Value);
                    if (propName != '_CustomObjectKey') {
                        recordValues.push(propValue.replace(/"/g, '`'));
                    }
                    if (propName == sfmcField[mode]) {
                        sfmcIdFieldFound = true;
                        if (!propValue || !isType(mode, propValue)) {
                            filtered[mode].push(propValue);
                            filteredRow = true;
                            break;
                        }
                    }
                }
                if (!sfmcIdFieldFound) {
                    filtered[mode].push('type-id-field not found');
                    filteredRow = true;
                }
                if (filteredRow) {
                    continue;
                }
                recordsFound++;
                csvData += '"' + recordValues.join('","') + '"\r\n';
            }
        } while (moreData);

        var filteredMsg = {
            sfContactId: 'non-SF-Contact-Ids',
            sfCaseId: 'non-SF-Case-Ids',
            contactGlobalId: 'non-SF-Global-Ids'
        };
        if (filtered[mode].length > 0) {
            logDebug(
                'Filtered out the following ' +
                    filteredMsg[mode] +
                    ': <details><summary><b>Show filtered Ids</b></summary><p>- ' +
                    filtered[mode].join('<br>- ') +
                    '</p></details>'
            );
        }
        if (recordsFound) {
            logDebug('Total records fetched from DE: ' + recordsFound);
        } else {
            // No records to process, so we can exit early
            logDebug('No records found to process. Exiting early.');
            return null;
        }
        logDebug('CSV Payload:');
        if (DEBUG) {
            Write('<details><summary><b>Show Records</b></summary><p>');
            Write('<textarea rows="4" cols="100">' + csvData + '</textarea>');
            var contentArr = csvToJsObject(csvData);
            writeJsonAsTable(contentArr);
            Write('</p></details>');
        }

        var bulkJobJSON = _createBulkReq(client);
        var jobid = bulkJobJSON.id;

        _updateBulkReq(client, jobid, csvData);

        _closeBulkReq(client, jobid);

        return csvData;
    } catch (ex) {
        logError('#5', ex);
        return null; // Return null in case of an error
    }
}
/**
 *
 * @param {string} id subscriber key
 * @returns {boolean} whether the id is a SF Contact Id
 */
function isSFContactId(id) {
    return id.startsWith('003') && id.length === 18;
}
/**
 *
 * @param {string} id subscriber key
 * @returns {boolean} whether the id is a SF Case Id
 */
function isSFCaseId(id) {
    return id.startsWith('500') && id.length === 18;
}
/**
 *
 * @param {string} id subscriber key
 * @returns {boolean} whether the id is a Global Id
 */
function isGlobalId(id) {
    return !id.startsWith('003') && !id.startsWith('500') && id.indexOf('-') > 0;
}
/**
 *
 * @param {'sfContactId'|'sfCaseId'|'contactGlobalId'} mode - id type to process
 * @param {string} id subscriber key
 * @returns {boolean} whether the id matches the specified type
 */
function isType(mode, id) {
    if (mode === 'sfContactId') {
        return isSFContactId(id);
    } else if (mode === 'sfCaseId') {
        return isSFCaseId(id);
    } else if (mode === 'contactGlobalId') {
        return isGlobalId(id);
    }
    return false;
}
/**
 * Creates a batch of Bulk records
 * @param {Client} client - client instance for API calls
 * @returns {object} returns JSON format of records
 */
function _createBulkReq(client) {
    try {
        var url = client.instance_url + '/services/data/v' + apiVersion + '/jobs/ingest/';
        var payload = {
            object: 'Task',
            externalIdFieldName: 'MarketingCloudUUID__c',
            contentType: 'CSV',
            operation: 'upsert',
            lineEnding: 'CRLF'
        };

        var req = new Script.Util.HttpRequest(url);
        req.encoding = 'UTF-8';

        req.emptyContentHandling = false;
        req.retries = 2;
        req.continueOnError = true;
        req.contentType = 'application/json';
        req.method = 'POST';
        req.setHeader('Authorization', 'Bearer ' + client.access_token);
        req.postData = Stringify(payload);

        var resp = req.send();
        var content = Platform.Function.ParseJSON(String(resp.content));
        logDebug('Create Bulk Response: <code>' + Stringify(content) + '</code>');

        return content;
    } catch (ex) {
        logError('#6', ex);
        return null; // Return null in case of an error
    }
}

/**
 * Sends the CSV to respective Job Id
 * @param {Client} client - Client instance for API calls
 * @param {string} jobid - job id of the batch process
 * @param {string} csvData - data to be transferred
 * @returns {object} returns response of the put call in JSON format
 */
function _updateBulkReq(client, jobid, csvData) {
    try {
        var url =
            client.instance_url +
            '/services/data/v' +
            apiVersion +
            '/jobs/ingest/' +
            jobid +
            '/batches';
        var req = new Script.Util.HttpRequest(url);
        req.encoding = 'UTF-8';
        req.emptyContentHandling = false;
        req.retries = 2;
        req.continueOnError = true;
        req.contentType = 'text/csv';
        req.method = 'PUT';
        req.setHeader('Authorization', 'Bearer ' + client.access_token);
        req.postData = csvData;

        var api = req.send();
        logDebug(
            'UpdateBulkReq Response - statusCode: ' +
                api.statusCode +
                '; returnStatus: ' +
                api.returnStatus
        );

        return Platform.Function.ParseJSON(String(api.content));
    } catch (ex) {
        logError('#7', ex);
        return null; // Return null in case of an error
    }
}

/**
 * Closes the Bulk job
 * Sends the CSV to respective Job Id
 * @param {Client} client - Client instance for API calls
 * @param {string} jobid - job id of the batch process
 * @returns {object} returns response of the patch call in JSON format
 */
function _closeBulkReq(client, jobid) {
    try {
        var url = client.instance_url + '/services/data/v' + apiVersion + '/jobs/ingest/' + jobid;
        var payload = { state: 'UploadComplete' };

        var req = new Script.Util.HttpRequest(url);
        req.encoding = 'UTF-8';
        req.emptyContentHandling = false;
        req.retries = 2;
        req.continueOnError = true;
        req.contentType = 'application/json';
        req.method = 'PATCH';
        req.setHeader('Authorization', 'Bearer ' + client.access_token);
        req.postData = Stringify(payload);

        var resp = req.send();
        var content = Platform.Function.ParseJSON(String(resp.content));
        logDebug('Close Bulk Response: <code>' + Stringify(content) + '</code>');
        logDebug('<a href="?jobid=' + jobid + '">Check the status of this job</a>');
        return content;
    } catch (ex) {
        logError('#8', ex);
        return null; // Return null in case of an error
    }
}
/**
 * Closes the Bulk job
 * Sends the CSV to respective Job Id
 * @param {Client} client - Client instance for API calls
 * @param {string} jobid - job id of the batch process
 * @param {''|'unprocessedrecords'|'successfulResults'|'failedResults'} type - type of result to be fetched
 * @returns {object} returns response of the patch call in JSON format
 */
function _statusBulkReq(client, jobid, type) {
    try {
        var url =
            client.instance_url +
            '/services/data/v' +
            apiVersion +
            '/jobs/ingest/' +
            jobid +
            (type ? '/' + type : '');

        var req = new Script.Util.HttpRequest(url);
        req.encoding = 'UTF-8';
        req.emptyContentHandling = false;
        req.retries = 2;
        req.continueOnError = true;
        req.contentType = 'application/csv';
        req.method = 'GET';
        req.setHeader('Authorization', 'Bearer ' + client.access_token);
        // req.postData = Stringify(payload);

        var api = req.send();

        logDebug(
            '_statusBulkReq-' +
                type +
                ' - statusCode: ' +
                api.statusCode +
                '; returnStatus: ' +
                api.returnStatus
        );
        var contentArr = csvToJsObject(String(api.content));
        if (type !== '') {
            logDebug('Records: ' + contentArr.length);
            if (DEBUG && contentArr.length > 0) {
                Write('<details><summary><b>Show Records</b></summary><p>');
                writeJsonAsTable(contentArr);
                Write('</p></details>');
            }
        }

        return Platform.Function.ParseJSON(String(api.content));
    } catch (ex) {
        logError('#x-' + type, ex);
        return null; // Return null in case of an error
    }
}
/**
 * Gets the rows from the DE to be processed
 * @param {Client} client - Client instance for API calls
 * @param {string} deCustKey - External Key of the DE
 * @param {string[]} deCols - columns of the DE to be fetched
 * @param {string} reqID - used to store the request ID to initiate the request
 * @param {'sfContactId'|'sfCaseId'|'contactGlobalId'} mode - id type to process
 * @returns {object} csvData
 */
function _getDERowsArray(client, deCustKey, deCols, reqID, mode) {
    try {
        if (DEBUG) {
            logDebug(
                'Fetching DE Records from ' +
                    deCustKey +
                    ' on MID ' +
                    client.mid +
                    (mode === 'sfContactId'
                        ? ' using <b><u>SF Contact Id</u></b>'
                        : mode === 'sfCaseId'
                          ? ' using <b><u>SF Case Id</u></b>'
                          : ' using <b><u>Contact Global Id</u></b>')
            );
        }
        client.proxy.setClientId({ ID: client.mid });
    } catch (ex) {
        logError('#9-a', ex);
        return null; // Return null in case of an error
    }
    // if (cacheDeRows) {
    //     // because we might run this method twice (once for SF Contact Id and once for Global Id),
    //     // we cache the results to avoid multiple calls to SFMC API
    //     return cacheDeRows;
    // }
    try {
        var deRecs;
        deRecs =
            reqID == null
                ? client.proxy.retrieve('DataExtensionObject[' + deCustKey + ']', deCols)
                : client.proxy.getNextBatch('DataExtensionObject[' + deCustKey + ']', reqID);
        // cacheDeRows = deRecs;
        return deRecs;
    } catch (ex) {
        logError('#9-b', ex);
        return null; // Return null in case of an error
    }
}

/**
 * debug Logging function
 * @param {string} message
 * Does not return anything.
 */
function logDebug(message) {
    if (DEBUG) {
        Write('\n<br><b>debug:</b> ' + message);
    }
}

/**
 * Error Logging function
 * @param {string} id custom identifier for the error log
 * @param {{message:string, description:string, source?:string}} ex - Exception raised in case of an error
 * Does not return anything.
 */
function logError(id, ex) {
    ex.source = 'AC_ActivityCreation_DEV';
    if (DEBUG) {
        Write('\n<br><b>error:</b> ' + id);
        Write('\n<br><b>error:</b> <i>Source:</i> ' + ex.source);
        Write('\n<br><b>error:</b> <i>Error message:</i> ' + Stringify(ex.message));
        Write('\n<br><b>error:</b> <i>Error description:</i> ' + Stringify(ex.description));
    }
    var config = {
        dataextension: 'AC_ScriptErrors',
        attributes: {
            Names: ['errorSource', 'errorMessage', 'errorDescription', 'errorDate'],
            Values: [ex.source, Stringify(ex.message), Stringify(ex.description), timestamp]
        }
    };
    try {
        prox.setClientId({ ID: mid });
        Platform.Function.InsertData(
            config.dataextension,
            config.attributes.Names,
            config.attributes.Values
        );
    } catch (innerEx) {
        if (DEBUG) {
            Write('<br>\n<b>Additional error while logging the error:</b> ' + Stringify(innerEx));
        }
    }
}

/**
 *
 * @param {string} csv CSV string to be converted
 * @returns {object[]} JavaScript object array
 */
function csvToJsObject(csv) {
    var lineEnding = '\r\n';
    var headerFieldSeparator = ',';
    var lineFieldSeparator = '","';
    var lines = csv.split(lineEnding);

    var result = [];

    var headers = lines[0].split(headerFieldSeparator);

    for (var i = 1; i < lines.length; i++) {
        if (!lines[i]) {
            continue;
        }
        var obj = {};
        var currentline = lines[i].split(lineFieldSeparator);

        for (var j = 0; j < headers.length; j++) {
            if (j === 0) {
                // delete leading "
                currentline[j] = currentline[j].replace(/^"/, '');
            } else if (j === headers.length - 1) {
                // delete trailing "
                currentline[j] = currentline[j].replace(/"$/, '');
            }
            obj[headers[j]] = currentline[j];
        }

        result.push(obj);
    }

    return result; // JavaScript object
}

/**
 *
 * @param {object[]} recordArray array of records to be rendered as HTML table
 */
function writeJsonAsTable(recordArray) {
    Write('<table border="1" style="border-collapse: collapse;">');
    // Table Header
    Write('<tr>');
    if (!recordArray || recordArray.length === 0) {
        Write('<th>No records</th>');
        Write('</tr>');
    } else {
        var first = recordArray[0];
        for (var col in first) {
            // eslint-disable-next-line no-prototype-builtins
            if (first.hasOwnProperty(col)) {
                Write('<th>' + String(col) + '</th>');
            }
        }
        Write('</tr>');

        // render rows
        for (var r = 0; r < recordArray.length; r++) {
            Write('<tr>');
            var row = recordArray[r];
            for (var c in row) {
                // eslint-disable-next-line no-prototype-builtins
                if (row.hasOwnProperty(c)) {
                    Write('<td>' + String(row[c] == null ? '' : row[c]) + '</td>');
                }
            }
            Write('</tr>');
        }
    }
    Write('</table>');
}
/**
 * Polyfills for SSJS environment
 */
function polyfills() {
    /**
     *
     * @param {Function} callback callback function for Array.forEach
     * @returns {void}
     */
    Array.prototype.forEach = function (callback) {
        for (var i = 0; i < this.length; i++) {
            callback(this[i], i, this);
        }
    };

    /**
     *
     * @param {Function} callbackFn callback function for Array.map
     * @returns {Array} mapped array
     */
    Array.prototype.map = function (callbackFn) {
        var arr = [];
        for (var i = 0; i < this.length; i++) {
            arr.push(callbackFn(this[i], i, this));
        }
        return arr;
    };

    if (!String.prototype.startsWith) {
        /**
         *
         * @param {string} searchString what to search for
         * @param {number} [position] where to start the search
         * @returns {boolean} whether the string starts with the searchString
         */
        String.prototype.startsWith = function (searchString, position) {
            // eslint-disable-next-line unicorn/prefer-default-parameters
            position = position || 0;
            return this.indexOf(searchString, position) === position;
        };
    }
    if (!String.prototype.endsWith) {
        /**
         *
         * @param {string} searchString what to search for
         * @param {number} position where to start the search
         * @returns {boolean} whether the string ends with the searchString
         */
        String.prototype.endsWith = function (searchString, position) {
            var searchLength = this.length - searchString.length;
            position = position || searchLength;
            return this.indexOf(searchString, position) === position;
        };
    }
    if (!String.prototype.trim) {
        // Make sure we trim BOM and NBSP
        var rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
        /**
         * @returns {string} trimmed string
         */
        String.prototype.trim = function () {
            return this.replace(rtrim, '');
        };

        "test".trim();
    }
}
