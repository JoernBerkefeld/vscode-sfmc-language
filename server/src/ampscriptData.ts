/**
 * AMPscript function definitions for auto-completion and hover/intellisense.
 *
 * Canonical function names, keywords, and personalization strings are sourced
 * from the shared ampscript-data package. Rich descriptions, parameter docs,
 * and examples in this file are original content for this extension.
 */

// Re-export shared canonical data for use throughout the language server
export {
    FUNCTIONS as canonicalFunctions,
    FUNCTION_CANONICAL_MAP,
    AMPSCRIPT_KEYWORDS as canonicalKeywordNames,
    PERSONALIZATION_STRINGS as canonicalPersonalizationStrings,
    functionNames,
    isEmailExcluded,
} from 'ampscript-data';

export interface AmpscriptFunctionParam {
    name: string;
    description: string;
    optional?: boolean;
    type?: string;
}

export interface AmpscriptFunction {
    name: string;
    syntax: string;
    description: string;
    category: string;
    params: AmpscriptFunctionParam[];
    returnType: string;
    example: string;
}

export const ampscriptFunctions: AmpscriptFunction[] = [
    {
        name: 'Add',
        syntax: 'Add(number1, number2)',
        description: 'Computes the sum of two numeric values and returns the result.',
        category: 'Math',
        params: [
            { name: 'number1', description: 'First numeric operand', type: 'number' },
            { name: 'number2', description: 'Second numeric operand', type: 'number' },
        ],
        returnType: 'number',
        example: '%%=Add(15, 27)=%%\n/* result: 42 */',
    },
    {
        name: 'AddMSCRMListMember',
        syntax: 'AddMSCRMListMember(listID, entityID)',
        description: 'Appends a member to a Microsoft Dynamics CRM list. Does not produce output.',
        category: 'Microsoft Dynamics CRM',
        params: [
            { name: 'listID', description: 'Identifier of the target CRM list', type: 'string' },
            { name: 'entityID', description: 'Identifier of the entity to add', type: 'string' },
        ],
        returnType: 'void',
        example: '%%[\n  AddMSCRMListMember(@listRef, @recordId)\n]%%',
    },
    {
        name: 'AddObjectArrayItem',
        syntax: 'AddObjectArrayItem(apiObject, propertyName, value)',
        description: 'Appends an item to an array property on a Marketing Cloud API object.',
        category: 'Marketing Cloud API',
        params: [
            { name: 'apiObject', description: 'API object reference', type: 'object' },
            { name: 'propertyName', description: 'Name of the array property', type: 'string' },
            { name: 'value', description: 'Value to append', type: 'string' },
        ],
        returnType: 'void',
        example:
            '%%[\n  set @obj = CreateObject("DataExtensionObject")\n  AddObjectArrayItem(@obj, "Items", @item)\n]%%',
    },
    {
        name: 'AttachFile',
        syntax: 'AttachFile(portfolio, customerKey, fileName, mimeType, isInline, contentDisposition, encoding, contentId)',
        description:
            'Includes a file attachment in the outgoing message, or renders a download link on a landing page.',
        category: 'Content',
        params: [
            {
                name: 'portfolio',
                description: 'Portfolio or content builder asset source',
                type: 'string',
            },
            {
                name: 'customerKey',
                description: 'Customer/external key of the file',
                type: 'string',
            },
            { name: 'fileName', description: 'Display name for the attachment', type: 'string' },
            {
                name: 'mimeType',
                description: 'MIME type string, e.g. "application/pdf"',
                type: 'string',
            },
            {
                name: 'isInline',
                description: 'Whether file is shown inline',
                type: 'boolean',
                optional: true,
            },
            {
                name: 'contentDisposition',
                description: 'Content-Disposition header value',
                type: 'string',
                optional: true,
            },
            { name: 'encoding', description: 'Character encoding', type: 'string', optional: true },
            {
                name: 'contentId',
                description: 'Content-ID for inline references',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'void',
        example:
            '%%[\n  AttachFile("Portfolio", "report-key", "Report.pdf", "application/pdf")\n]%%',
    },
    {
        name: 'AttributeValue',
        syntax: 'AttributeValue(attributeName)',
        description:
            'Safely retrieves an attribute value from the current subscriber/contact context. Returns null instead of raising an error when the attribute is absent.',
        category: 'Utility',
        params: [
            {
                name: 'attributeName',
                description: 'Name of the subscriber or data extension attribute',
                type: 'string',
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @email = AttributeValue("EmailAddress")\n]%%',
    },
    {
        name: 'AuthenticatedEmployeeID',
        syntax: 'AuthenticatedEmployeeID()',
        description:
            'Retrieves the numeric ID of the Marketing Cloud user currently logged into the page.',
        category: 'Utility',
        params: [],
        returnType: 'number',
        example: '%%=AuthenticatedEmployeeID()=%%',
    },
    {
        name: 'AuthenticatedEmployeeNotificationAddress',
        syntax: 'AuthenticatedEmployeeNotificationAddress()',
        description:
            'Retrieves the notification email address associated with the authenticated Marketing Cloud user.',
        category: 'Utility',
        params: [],
        returnType: 'string',
        example: '%%=AuthenticatedEmployeeNotificationAddress()=%%',
    },
    {
        name: 'AuthenticatedEmployeeUserName',
        syntax: 'AuthenticatedEmployeeUserName()',
        description:
            'Retrieves the username of the Marketing Cloud user who is currently authenticated.',
        category: 'Utility',
        params: [],
        returnType: 'string',
        example: '%%=AuthenticatedEmployeeUserName()=%%',
    },
    {
        name: 'AuthenticatedEnterpriseID',
        syntax: 'AuthenticatedEnterpriseID()',
        description:
            'Returns the Enterprise ID (parent MID) for the current Marketing Cloud session.',
        category: 'Utility',
        params: [],
        returnType: 'number',
        example: '%%=AuthenticatedEnterpriseID()=%%',
    },
    {
        name: 'AuthenticatedMemberID',
        syntax: 'AuthenticatedMemberID()',
        description:
            'Returns the MID (Member ID) of the business unit for the authenticated session.',
        category: 'Utility',
        params: [],
        returnType: 'number',
        example: '%%=AuthenticatedMemberID()=%%',
    },
    {
        name: 'AuthenticatedMemberName',
        syntax: 'AuthenticatedMemberName()',
        description:
            'Returns the account name for the business unit of the current authenticated session.',
        category: 'Utility',
        params: [],
        returnType: 'string',
        example: '%%=AuthenticatedMemberName()=%%',
    },
    {
        name: 'BarcodeURL',
        syntax: 'BarcodeURL(type, value, width, height, quality, rotation, includeText, textPosition, textAlignment)',
        description: 'Produces a URL pointing to a dynamically generated barcode image.',
        category: 'Content',
        params: [
            { name: 'type', description: 'Barcode type (e.g. "UPCA", "Code128")', type: 'string' },
            { name: 'value', description: 'Data to encode in the barcode', type: 'string' },
            { name: 'width', description: 'Image width in pixels', type: 'number' },
            { name: 'height', description: 'Image height in pixels', type: 'number' },
            { name: 'quality', description: 'Image quality setting', type: 'string' },
            { name: 'rotation', description: 'Rotation angle', type: 'number' },
            {
                name: 'includeText',
                description: 'Whether to show text below barcode',
                type: 'boolean',
            },
            { name: 'textPosition', description: 'Position of text label', type: 'string' },
            { name: 'textAlignment', description: 'Alignment of text label', type: 'string' },
        ],
        returnType: 'string',
        example: '%%=BarcodeURL("Code128", @coupon, 300, 100, "H", 0, true, "Bottom", "Center")=%%',
    },
    {
        name: 'Base64Decode',
        syntax: 'Base64Decode(encodedString, encoding, convertFromHex)',
        description: 'Decodes a Base64-encoded string back to its original form.',
        category: 'Encryption and Encoding',
        params: [
            { name: 'encodedString', description: 'The Base64-encoded input', type: 'string' },
            {
                name: 'encoding',
                description: 'Character encoding (e.g. "UTF-8")',
                type: 'string',
                optional: true,
            },
            {
                name: 'convertFromHex',
                description: 'Whether to convert from hex after decoding',
                type: 'boolean',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @decoded = Base64Decode(@payload)\n]%%',
    },
    {
        name: 'Base64Encode',
        syntax: 'Base64Encode(inputString, encoding)',
        description: 'Encodes a string to its Base64 representation.',
        category: 'Encryption and Encoding',
        params: [
            { name: 'inputString', description: 'The string to encode', type: 'string' },
            {
                name: 'encoding',
                description: 'Character encoding (e.g. "UTF-8")',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @token = Base64Encode("admin:s3cret")\n]%%',
    },
    {
        name: 'BeginImpressionRegion',
        syntax: 'BeginImpressionRegion(regionName)',
        description:
            'Opens a named content impression region for tracking purposes. Pair with EndImpressionRegion.',
        category: 'Content',
        params: [
            {
                name: 'regionName',
                description: 'Unique name for the impression region',
                type: 'string',
            },
        ],
        returnType: 'void',
        example: '%%=BeginImpressionRegion("hero_banner")=%%',
    },
    {
        name: 'BuildOptionList',
        syntax: 'BuildOptionList(dataExtension, displayColumn, valueColumn, selectedValue...)',
        description:
            'Generates HTML <option> elements suitable for use within <select>, <optgroup>, or <datalist> tags.',
        category: 'Content',
        params: [
            {
                name: 'dataExtension',
                description: 'Name of the Data Extension to read options from',
                type: 'string',
            },
            {
                name: 'displayColumn',
                description: 'Column name for the visible option text',
                type: 'string',
            },
            {
                name: 'valueColumn',
                description: 'Column name for the option value attribute',
                type: 'string',
            },
            {
                name: 'selectedValue',
                description: 'Value to mark as pre-selected',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%=BuildOptionList("Regions", "Label", "Value", @chosenRegion)=%%',
    },
    {
        name: 'BuildRowsetFromJSON',
        syntax: 'BuildRowsetFromJSON(jsonString, jsonPath, columnName)',
        description:
            'Parses a JSON string and constructs a row set from the values found at the specified JSON path.',
        category: 'Content',
        params: [
            { name: 'jsonString', description: 'JSON data to parse', type: 'string' },
            {
                name: 'jsonPath',
                description: 'JSON path expression to select nodes',
                type: 'string',
            },
            {
                name: 'columnName',
                description: 'Name for the resulting column',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'rowset',
        example: '%%[\n  set @rows = BuildRowsetFromJSON(@apiResponse, "$.results[*].sku")\n]%%',
    },
    {
        name: 'BuildRowSetFromString',
        syntax: 'BuildRowSetFromString(inputString, delimiter)',
        description: 'Splits a delimited string into a row set where each segment becomes a row.',
        category: 'Content',
        params: [
            { name: 'inputString', description: 'The string to split', type: 'string' },
            { name: 'delimiter', description: 'Delimiter to split on', type: 'string' },
        ],
        returnType: 'rowset',
        example: '%%[\n  set @colors = BuildRowSetFromString("red,blue,green", ",")\n]%%',
    },
    {
        name: 'BuildRowSetFromXML',
        syntax: 'BuildRowSetFromXML(xmlString, xpath, isSensitive)',
        description:
            'Extracts data from an XML string via an XPath expression and returns it as a row set.',
        category: 'Content',
        params: [
            { name: 'xmlString', description: 'Input XML data', type: 'string' },
            { name: 'xpath', description: 'XPath expression to select nodes', type: 'string' },
            {
                name: 'isSensitive',
                description: 'Whether selection is case-sensitive',
                type: 'boolean',
                optional: true,
            },
        ],
        returnType: 'rowset',
        example: '%%[\n  set @nodes = BuildRowSetFromXML(@xmlPayload, "/catalog/product")\n]%%',
    },
    {
        name: 'Char',
        syntax: 'Char(asciiCode)',
        description: 'Converts an ASCII code number to its corresponding character.',
        category: 'String',
        params: [
            { name: 'asciiCode', description: 'The ASCII character code (0-127)', type: 'number' },
        ],
        returnType: 'string',
        example: '%%[\n  /* newline character */\n  set @nl = Char(10)\n]%%',
    },
    {
        name: 'ClaimRow',
        syntax: 'ClaimRow(dataExtension, lockColumn, lockValue, keyColumn, keyValue...)',
        description:
            'Reserves and returns a single unclaimed row from a Data Extension, preventing concurrent use. Commonly used for unique coupon distribution.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'lockColumn', description: 'Column used for the lock flag', type: 'string' },
            { name: 'lockValue', description: 'Value written to lock the row', type: 'string' },
            { name: 'keyColumn', description: 'Column name for filtering', type: 'string' },
            {
                name: 'keyValue',
                description: 'Value to match in the key column',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'row',
        example:
            '%%[\n  set @voucherRow = ClaimRow("OfferPool", "Assigned", "true", "Segment", "premium")\n]%%',
    },
    {
        name: 'ClaimRowValue',
        syntax: 'ClaimRowValue(returnColumn, dataExtension, lockColumn, lockValue, defaultValue, keyColumn, keyValue...)',
        description:
            "Like ClaimRow but returns a specific column's value. If no unclaimed rows remain, returns the specified default instead of erroring.",
        category: 'Data Extension',
        params: [
            { name: 'returnColumn', description: 'Column whose value to return', type: 'string' },
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'lockColumn', description: 'Column used for the lock flag', type: 'string' },
            { name: 'lockValue', description: 'Value written to lock the row', type: 'string' },
            {
                name: 'defaultValue',
                description: 'Fallback value if no rows available',
                type: 'string',
            },
            { name: 'keyColumn', description: 'Column name for filtering', type: 'string' },
            {
                name: 'keyValue',
                description: 'Value to match in the key column',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example:
            '%%[\n  set @code = ClaimRowValue("Token", "OfferPool", "Redeemed", "1", "DEFAULT99", "Level", @level)\n]%%',
    },
    {
        name: 'CloudPagesURL',
        syntax: 'CloudPagesURL(pageID, param1Name, param1Value...)',
        description:
            'Builds an encrypted URL to a CloudPages landing page, optionally appending name/value parameter pairs to the query string.',
        category: 'Utility',
        params: [
            { name: 'pageID', description: 'ID of the CloudPages page (number or string)' },
            {
                name: 'param1Name',
                description: 'Name of first query parameter',
                type: 'string',
                optional: true,
            },
            {
                name: 'param1Value',
                description: 'Value of first query parameter',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example:
            '%%[\n  set @url = CloudPagesURL(842, "sku", @productSku, "uid", @recipientId)\n]%%',
    },
    {
        name: 'Concat',
        syntax: 'Concat(string1, string2, ...stringN)',
        description: 'Joins two or more string values together end-to-end.',
        category: 'String',
        params: [
            { name: 'string1', description: 'First string', type: 'string' },
            { name: 'string2', description: 'Second string', type: 'string' },
            {
                name: 'stringN',
                description: 'Additional strings to append',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @greeting = Concat("Hello, ", @userName, "!")\n]%%',
    },
    {
        name: 'ContentArea',
        syntax: 'ContentArea(contentAreaID, impressionRegion, layout, throwError, defaultContent)',
        description: 'Retrieves content from a Classic Content Area by its numeric ID.',
        category: 'Content',
        params: [
            {
                name: 'contentAreaID',
                description: 'Numeric ID of the Content Area',
                type: 'number',
            },
            {
                name: 'impressionRegion',
                description: 'Impression region name',
                type: 'string',
                optional: true,
            },
            {
                name: 'layout',
                description: 'Layout type (e.g. "block")',
                type: 'boolean',
                optional: true,
            },
            {
                name: 'throwError',
                description: 'Whether to throw on missing content',
                type: 'string',
                optional: true,
            },
            {
                name: 'defaultContent',
                description: 'Fallback content string',
                type: 'boolean',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%=ContentArea(1234)=%%',
    },
    {
        name: 'ContentAreaByName',
        syntax: 'ContentAreaByName(folderPath, impressionRegion, layout, throwError, defaultContent)',
        description: 'Retrieves content from a Classic Content Area by its full folder path.',
        category: 'Content',
        params: [
            {
                name: 'folderPath',
                description: String.raw`Full path to the Content Area, e.g. "my content\header"`,
                type: 'string',
            },
            {
                name: 'impressionRegion',
                description: 'Impression region name',
                type: 'string',
                optional: true,
            },
            { name: 'layout', description: 'Layout type', type: 'boolean', optional: true },
            {
                name: 'throwError',
                description: 'Whether to throw on missing content',
                type: 'string',
                optional: true,
            },
            {
                name: 'defaultContent',
                description: 'Fallback content string',
                type: 'boolean',
                optional: true,
            },
        ],
        returnType: 'string',
        example: String.raw`%%=ContentAreaByName("my content\header")=%%`,
    },
    {
        name: 'ContentBlockByID',
        syntax: 'ContentBlockByID(contentBlockID, impressionRegion, throwError, defaultContent, treatAsContent)',
        description: 'Fetches a Content Builder block by its numeric ID and renders its content.',
        category: 'Content',
        params: [
            {
                name: 'contentBlockID',
                description: 'ID of the content block (number or string)',
            },
            {
                name: 'impressionRegion',
                description: 'Impression region name',
                type: 'string',
                optional: true,
            },
            {
                name: 'throwError',
                description: 'Whether to throw if the block is not found',
                type: 'boolean',
                optional: true,
            },
            {
                name: 'defaultContent',
                description: 'Fallback content',
                type: 'string',
                optional: true,
            },
            {
                name: 'treatAsContent',
                description: 'Whether to evaluate AMPscript within',
                type: 'boolean',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%=ContentBlockByID(5678)=%%',
    },
    {
        name: 'ContentBlockByKey',
        syntax: 'ContentBlockByKey(customerKey, impressionRegion, throwError, defaultContent, treatAsContent)',
        description:
            'Fetches a Content Builder block by its customer/external key and renders its content.',
        category: 'Content',
        params: [
            {
                name: 'customerKey',
                description: 'The customer key of the content block',
                type: 'string',
            },
            {
                name: 'impressionRegion',
                description: 'Impression region name',
                type: 'string',
                optional: true,
            },
            {
                name: 'throwError',
                description: 'Whether to throw if the block is not found',
                type: 'boolean',
                optional: true,
            },
            {
                name: 'defaultContent',
                description: 'Fallback content',
                type: 'string',
                optional: true,
            },
            {
                name: 'treatAsContent',
                description: 'Whether to evaluate AMPscript within',
                type: 'boolean',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%=ContentBlockByKey("footer-2024")=%%',
    },
    {
        name: 'ContentBlockByName',
        syntax: 'ContentBlockByName(folderPath, impressionRegion, throwError, defaultContent, treatAsContent)',
        description: 'Fetches a Content Builder block by its full path and renders its content.',
        category: 'Content',
        params: [
            {
                name: 'folderPath',
                description: 'Full Content Builder path to the block',
                type: 'string',
            },
            {
                name: 'impressionRegion',
                description: 'Impression region name',
                type: 'string',
                optional: true,
            },
            {
                name: 'throwError',
                description: 'Whether to throw if the block is not found',
                type: 'boolean',
                optional: true,
            },
            {
                name: 'defaultContent',
                description: 'Fallback content',
                type: 'string',
                optional: true,
            },
            {
                name: 'treatAsContent',
                description: 'Whether to evaluate AMPscript within',
                type: 'boolean',
                optional: true,
            },
        ],
        returnType: 'string',
        example: String.raw`%%=ContentBlockByName("Content Builder\Shared\Footer")=%%`,
    },
    {
        name: 'ContentImageByID',
        syntax: 'ContentImageByID(imageID, altText)',
        description:
            'Generates an HTML <img> tag for a Content Builder image referenced by numeric ID.',
        category: 'Content',
        params: [
            { name: 'imageID', description: 'Numeric ID of the image asset', type: 'number' },
            {
                name: 'altText',
                description: 'Alt-text for the image',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%=ContentImageByID(9012, "Product photo")=%%',
    },
    {
        name: 'ContentImageByKey',
        syntax: 'ContentImageByKey(customerKey, altText)',
        description:
            'Generates an HTML <img> tag for a Content Builder image referenced by its customer key.',
        category: 'Content',
        params: [
            { name: 'customerKey', description: 'Customer key of the image asset', type: 'string' },
            {
                name: 'altText',
                description: 'Alt-text for the image',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%=ContentImageByKey("logo-dark", "Company logo")=%%',
    },
    {
        name: 'CreateMSCRMRecord',
        syntax: 'CreateMSCRMRecord(entityName, fieldName1, fieldValue1, fieldName2, fieldValue2...)',
        description:
            'Inserts a new record into a Microsoft Dynamics CRM entity and returns its GUID.',
        category: 'Microsoft Dynamics CRM',
        params: [
            { name: 'entityName', description: 'CRM entity logical name', type: 'string' },
            { name: 'fieldName1', description: 'First field name', type: 'string' },
            { name: 'fieldValue1', description: 'First field value', type: 'string' },
            {
                name: 'fieldName2',
                description: 'Additional field name',
                type: 'string',
                optional: true,
            },
            {
                name: 'fieldValue2',
                description: 'Additional field value',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example:
            '%%[\n  set @guid = CreateMSCRMRecord("contact", "firstname", @fName, "lastname", @lName)\n]%%',
    },
    {
        name: 'CreateObject',
        syntax: 'CreateObject(objectType)',
        description:
            'Instantiates a Marketing Cloud SOAP API object that can later have properties set and be invoked.',
        category: 'Marketing Cloud API',
        params: [
            {
                name: 'objectType',
                description: 'API object type name (e.g. "TriggeredSend")',
                type: 'string',
            },
        ],
        returnType: 'object',
        example: '%%[\n  set @ts = CreateObject("TriggeredSend")\n]%%',
    },
    {
        name: 'CreateSalesforceObject',
        syntax: 'CreateSalesforceObject(objectName, fieldCount, fieldName1, fieldValue1...)',
        description:
            'Creates a new record in a Salesforce standard or custom object. Returns the 18-character record ID.',
        category: 'Sales and Service Cloud',
        params: [
            {
                name: 'objectName',
                description: 'API name of the Salesforce object',
                type: 'string',
            },
            { name: 'fieldCount', description: 'Number of field name/value pairs', type: 'number' },
            { name: 'fieldName1', description: 'First field API name', type: 'string' },
            { name: 'fieldValue1', description: 'First field value', type: 'string' },
        ],
        returnType: 'string',
        example:
            '%%[\n  set @sfId = CreateSalesforceObject("Task", 2, "Subject", "Follow-up", "Status", "Open")\n]%%',
    },
    {
        name: 'CreateSmsConversation',
        syntax: 'CreateSmsConversation(shortCode, keyword, mobileNumber, nextKeyword)',
        description:
            'Initiates an SMS conversation thread. Returns true on success, false on failure.',
        category: 'MobileConnect',
        params: [
            { name: 'shortCode', description: 'Short or long code', type: 'string' },
            { name: 'keyword', description: 'Initial conversation keyword', type: 'string' },
            { name: 'mobileNumber', description: 'Contact mobile number', type: 'string' },
            {
                name: 'nextKeyword',
                description: 'Keyword for the next expected reply',
                type: 'string',
            },
        ],
        returnType: 'boolean',
        example: '%%[\n  set @ok = CreateSmsConversation("12345", "JOIN", @mobile, "CONFIRM")\n]%%',
    },
    {
        name: 'DataExtensionRowCount',
        syntax: 'DataExtensionRowCount(dataExtensionName)',
        description: 'Returns the total number of rows in the specified Data Extension.',
        category: 'Data Extension',
        params: [
            {
                name: 'dataExtensionName',
                description: 'Name or external key of the Data Extension',
                type: 'string',
            },
        ],
        returnType: 'number',
        example: '%%[\n  set @total = DataExtensionRowCount("ContactDirectory")\n]%%',
    },
    {
        name: 'DateAdd',
        syntax: 'DateAdd(date, number, datePart)',
        description: 'Adds a specified interval to a date and returns the resulting date.',
        category: 'Date and Time',
        params: [
            { name: 'date', description: 'Starting date value', type: 'date' },
            {
                name: 'number',
                description: 'Number of intervals to add (negative to subtract)',
                type: 'number',
            },
            {
                name: 'datePart',
                description:
                    'Interval type: "Y" (year), "M" (month), "D" (day), "H" (hour), "MI" (minute)',
                type: 'string',
            },
        ],
        returnType: 'date',
        example: '%%[\n  set @nextWeek = DateAdd(Now(), 7, "D")\n]%%',
    },
    {
        name: 'DateDiff',
        syntax: 'DateDiff(startDate, endDate, datePart)',
        description: 'Calculates the difference between two dates in the specified interval units.',
        category: 'Date and Time',
        params: [
            { name: 'startDate', description: 'The earlier date', type: 'date' },
            { name: 'endDate', description: 'The later date', type: 'date' },
            {
                name: 'datePart',
                description: 'Interval type: "Y", "M", "D", "H", "MI"',
                type: 'string',
            },
        ],
        returnType: 'number',
        example: '%%[\n  set @daysUntilExpiry = DateDiff(Now(), @expirationDate, "D")\n]%%',
    },
    {
        name: 'DateParse',
        syntax: 'DateParse(dateString, convertUTC)',
        description: 'Interprets a date string and converts it into a proper DateTime value.',
        category: 'Date and Time',
        params: [
            { name: 'dateString', description: 'String representation of a date', type: 'string' },
            {
                name: 'convertUTC',
                description: 'Whether to treat as UTC',
                type: 'boolean',
                optional: true,
            },
        ],
        returnType: 'date',
        example: '%%[\n  set @dt = DateParse("2026-03-15 14:30:00")\n]%%',
    },
    {
        name: 'DatePart',
        syntax: 'DatePart(date, datePart)',
        description: 'Extracts a specific component (year, month, day, etc.) from a date value.',
        category: 'Date and Time',
        params: [
            { name: 'date', description: 'Input date value', type: 'date' },
            {
                name: 'datePart',
                description: 'Component to extract: "Y", "M", "D", "H", "MI"',
                type: 'string',
            },
        ],
        returnType: 'number',
        example: '%%[\n  set @currentMonth = DatePart(Now(), "M")\n]%%',
    },
    {
        name: 'DecryptSymmetric',
        syntax: 'DecryptSymmetric(cipherText, algorithm, passwordExternalKey, password, saltExternalKey, salt, ivExternalKey, iv)',
        description:
            'Decrypts a previously encrypted string using a symmetric algorithm and the matching key material.',
        category: 'Encryption and Encoding',
        params: [
            {
                name: 'cipherText',
                description: 'Encrypted Base64 string to decrypt',
                type: 'string',
            },
            { name: 'algorithm', description: 'Algorithm name (e.g. "AES")', type: 'string' },
            {
                name: 'passwordExternalKey',
                description: 'External key for the password in Key Management',
                type: 'string',
            },
            {
                name: 'password',
                description: 'Password string (use empty string if using external key)',
                type: 'string',
            },
            { name: 'saltExternalKey', description: 'External key for the salt', type: 'string' },
            { name: 'salt', description: 'Salt string', type: 'string' },
            {
                name: 'ivExternalKey',
                description: 'External key for the initialization vector',
                type: 'string',
            },
            { name: 'iv', description: 'Initialization vector string', type: 'string' },
        ],
        returnType: 'string',
        example:
            '%%[\n  set @plain = DecryptSymmetric(@cipher, "AES", "pwd-key", "", "salt-key", "", "iv-key", "")\n]%%',
    },
    {
        name: 'DeleteData',
        syntax: 'DeleteData(dataExtension, column1, value1, column2, value2...)',
        description:
            'Removes rows from a Data Extension matching the given column/value criteria. Returns the count of deleted rows. Landing pages and CloudPages only.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'column1', description: 'First match column name', type: 'string' },
            { name: 'value1', description: 'Value to match in column1', type: 'string' },
            {
                name: 'column2',
                description: 'Additional match column',
                type: 'string',
                optional: true,
            },
            {
                name: 'value2',
                description: 'Additional match value',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'number',
        example: '%%[\n  set @removed = DeleteData("TempCart", "SessionId", @sid)\n]%%',
    },
    {
        name: 'DeleteDE',
        syntax: 'DeleteDE(dataExtension, column1, value1, column2, value2...)',
        description:
            'Removes rows from a Data Extension matching the given criteria. Email sends only (no return value).',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'column1', description: 'First match column name', type: 'string' },
            { name: 'value1', description: 'Value to match', type: 'string' },
            {
                name: 'column2',
                description: 'Additional match column',
                type: 'string',
                optional: true,
            },
            {
                name: 'value2',
                description: 'Additional match value',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'void',
        example: '%%[\n  DeleteDE("PendingNotifications", "SubscriberKey", _subscriberKey)\n]%%',
    },
    {
        name: 'DescribeMSCRMEntities',
        syntax: 'DescribeMSCRMEntities()',
        description:
            'Returns the logical and display names for all entity types in the connected Dynamics CRM org.',
        category: 'Microsoft Dynamics CRM',
        params: [],
        returnType: 'rowset',
        example: '%%[\n  set @entities = DescribeMSCRMEntities()\n]%%',
    },
    {
        name: 'DescribeMSCRMEntityAttributes',
        syntax: 'DescribeMSCRMEntityAttributes(entityName)',
        description:
            'Returns attribute metadata (logical name, display name, data type) for the specified CRM entity.',
        category: 'Microsoft Dynamics CRM',
        params: [
            { name: 'entityName', description: 'Logical name of the CRM entity', type: 'string' },
        ],
        returnType: 'rowset',
        example: '%%[\n  set @attrs = DescribeMSCRMEntityAttributes("account")\n]%%',
    },
    {
        name: 'Divide',
        syntax: 'Divide(dividend, divisor)',
        description: 'Divides the first number by the second and returns the quotient.',
        category: 'Math',
        params: [
            { name: 'dividend', description: 'The number to be divided', type: 'number' },
            { name: 'divisor', description: 'The number to divide by', type: 'number' },
        ],
        returnType: 'number',
        example: '%%[\n  set @average = Divide(@totalScore, @numEntries)\n]%%',
    },
    {
        name: 'Domain',
        syntax: 'Domain(emailAddress)',
        description:
            'Extracts the domain portion (everything after @) from an email address string.',
        category: 'Utility',
        params: [
            { name: 'emailAddress', description: 'A valid email address string', type: 'string' },
        ],
        returnType: 'string',
        example: '%%[\n  set @dom = Domain("user@example.com")\n  /* result: "example.com" */\n]%%',
    },
    {
        name: 'Empty',
        syntax: 'Empty(expression)',
        description:
            'Tests whether a value is null or an empty string. Returns true if so, false otherwise.',
        category: 'Utility',
        params: [
            { name: 'expression', description: 'Value or expression to test', type: 'string' },
        ],
        returnType: 'boolean',
        example:
            '%%[\n  if Empty(@lastName) then\n    set @lastName = "Valued Customer"\n  endif\n]%%',
    },
    {
        name: 'EncryptSymmetric',
        syntax: 'EncryptSymmetric(plainText, algorithm, passwordExternalKey, password, saltExternalKey, salt, ivExternalKey, iv)',
        description:
            'Encrypts a string using a symmetric algorithm and returns the result as Base64.',
        category: 'Encryption and Encoding',
        params: [
            { name: 'plainText', description: 'String to encrypt', type: 'string' },
            { name: 'algorithm', description: 'Algorithm name (e.g. "AES")', type: 'string' },
            {
                name: 'passwordExternalKey',
                description: 'External key for password in Key Management',
                type: 'string',
            },
            { name: 'password', description: 'Password string', type: 'string' },
            { name: 'saltExternalKey', description: 'External key for salt', type: 'string' },
            { name: 'salt', description: 'Salt string', type: 'string' },
            { name: 'ivExternalKey', description: 'External key for IV', type: 'string' },
            { name: 'iv', description: 'Initialization vector string', type: 'string' },
        ],
        returnType: 'string',
        example:
            '%%[\n  set @encrypted = EncryptSymmetric(@ssn, "AES", "pwd-key", "", "salt-key", "", "iv-key", "")\n]%%',
    },
    {
        name: 'EndImpressionRegion',
        syntax: 'EndImpressionRegion(endOutput)',
        description:
            'Closes a previously opened impression region started with BeginImpressionRegion.',
        category: 'Content',
        params: [
            {
                name: 'endOutput',
                description: 'Pass true to include region end output',
                type: 'boolean',
                optional: true,
            },
        ],
        returnType: 'void',
        example: '%%=EndImpressionRegion(true)=%%',
    },
    {
        name: 'EndSmsConversation',
        syntax: 'EndSmsConversation(shortCode, mobileNumber)',
        description:
            'Terminates an active SMS conversation. Returns true on success, false on failure.',
        category: 'MobileConnect',
        params: [
            { name: 'shortCode', description: 'The short or long code', type: 'string' },
            { name: 'mobileNumber', description: 'Contact mobile number', type: 'string' },
        ],
        returnType: 'boolean',
        example: '%%[\n  set @ended = EndSmsConversation("12345", @phone)\n]%%',
    },
    {
        name: 'ExecuteFilter',
        syntax: 'ExecuteFilter(filterName)',
        description:
            'Runs a pre-defined Data Extension filter and returns the matching rows as a row set.',
        category: 'Data Extension',
        params: [
            {
                name: 'filterName',
                description: 'Name of the Data Filter to execute',
                type: 'string',
            },
        ],
        returnType: 'rowset',
        example: '%%[\n  set @results = ExecuteFilter("EngagedContacts")\n]%%',
    },
    {
        name: 'ExecuteFilterOrderedRows',
        syntax: 'ExecuteFilterOrderedRows(filterName, maxRows, sortColumn)',
        description:
            'Runs a Data Extension filter and returns a sorted row set with a maximum row count.',
        category: 'Data Extension',
        params: [
            { name: 'filterName', description: 'Name of the Data Filter', type: 'string' },
            { name: 'maxRows', description: 'Maximum number of rows to return', type: 'number' },
            {
                name: 'sortColumn',
                description: 'Column to sort by (prefix with "ASC " or "DESC ")',
                type: 'string',
            },
        ],
        returnType: 'rowset',
        example:
            '%%[\n  set @topResults = ExecuteFilterOrderedRows("EngagedContacts", 10, "DESC LastInteraction")\n]%%',
    },
    {
        name: 'Field',
        syntax: 'Field(row, columnName, ordinal)',
        description:
            'Extracts a column value from a single row (returned by Row, ClaimRow, etc.) or from an API object property.',
        category: 'Data Extension',
        params: [
            { name: 'row', description: 'Row object to read from', type: 'row' },
            { name: 'columnName', description: 'Name of the column/field', type: 'string' },
            {
                name: 'ordinal',
                description: 'Zero-based index for multi-value properties',
                type: 'number',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @name = Field(@row, "FullName")\n]%%',
    },
    {
        name: 'Format',
        syntax: 'Format(value, formatPattern, locale, currencyCode)',
        description:
            'Formats a value according to a .NET-style format pattern, optionally with a locale.',
        category: 'Utility',
        params: [
            { name: 'value', description: 'Value to format', type: 'string' },
            {
                name: 'formatPattern',
                description: 'Format string (e.g. "C2", "N0", "yyyy-MM-dd")',
                type: 'string',
            },
            {
                name: 'locale',
                description: 'Culture code (e.g. "en-US")',
                type: 'string',
                optional: true,
            },
            {
                name: 'currencyCode',
                description: 'ISO currency code',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @price = Format(49.9, "C2", "en-US")\n  /* result: "$49.90" */\n]%%',
    },
    {
        name: 'FormatCurrency',
        syntax: 'FormatCurrency(amount, locale, decimals, symbol)',
        description:
            'Renders a numeric value as a formatted currency string for the specified locale.',
        category: 'Utility',
        params: [
            { name: 'amount', description: 'Numeric amount to format', type: 'number' },
            { name: 'locale', description: 'Culture code (e.g. "de-DE")', type: 'string' },
            {
                name: 'decimals',
                description: 'Number of decimal places',
                type: 'number',
                optional: true,
            },
            {
                name: 'symbol',
                description: 'Custom currency symbol',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @euroPrice = FormatCurrency(@amount, "de-DE", 2)\n]%%',
    },
    {
        name: 'FormatDate',
        syntax: 'FormatDate(date, formatType, formatPattern, locale)',
        description:
            'Converts a date into a formatted string using a format type or custom pattern.',
        category: 'Date and Time',
        params: [
            { name: 'date', description: 'Date value to format', type: 'date' },
            {
                name: 'formatType',
                description: '"S" (short), "L" (long), "SM" (short month), etc.',
                type: 'string',
            },
            {
                name: 'formatPattern',
                description: 'Custom .NET date format pattern',
                type: 'string',
                optional: true,
            },
            { name: 'locale', description: 'Culture code', type: 'string', optional: true },
        ],
        returnType: 'string',
        example: '%%[\n  set @fmtDate = FormatDate(Now(), "S")\n  /* e.g. "3/26/2026" */\n]%%',
    },
    {
        name: 'FormatNumber',
        syntax: 'FormatNumber(number, formatPattern, locale)',
        description: 'Formats a numeric value using a .NET-style number format pattern.',
        category: 'Utility',
        params: [
            { name: 'number', description: 'Numeric value to format', type: 'number' },
            {
                name: 'formatPattern',
                description: 'Format string (e.g. "N2", "P0")',
                type: 'string',
            },
            { name: 'locale', description: 'Culture code', type: 'string', optional: true },
        ],
        returnType: 'string',
        example:
            '%%[\n  set @formatted = FormatNumber(12345.6, "N2")\n  /* result: "12,345.60" */\n]%%',
    },
    {
        name: 'GetJWT',
        syntax: 'GetJWT(payload, algorithm, secret)',
        description: 'Creates a JSON Web Token from a JSON payload using a hard-coded secret.',
        category: 'Encryption and Encoding',
        params: [
            { name: 'payload', description: 'JSON string payload', type: 'string' },
            { name: 'algorithm', description: 'Signing algorithm (e.g. "HS256")', type: 'string' },
            { name: 'secret', description: 'Secret key for signing', type: 'string' },
        ],
        returnType: 'string',
        example: '%%[\n  set @jwt = GetJWT(\'{"sub":"user1"}\', "HS256", @secret)\n]%%',
    },
    {
        name: 'GetJWTByKeyName',
        syntax: 'GetJWTByKeyName(payload, algorithm, keyName)',
        description:
            'Creates a JSON Web Token using a secret stored in Marketing Cloud Key Management.',
        category: 'Encryption and Encoding',
        params: [
            { name: 'payload', description: 'JSON string payload', type: 'string' },
            { name: 'algorithm', description: 'Signing algorithm', type: 'string' },
            { name: 'keyName', description: 'External key name in Key Management', type: 'string' },
        ],
        returnType: 'string',
        example:
            '%%[\n  set @jwt = GetJWTByKeyName(\'{"sub":"user1"}\', "HS256", "my-jwt-key")\n]%%',
    },
    {
        name: 'GetPortfolioItem',
        syntax: 'GetPortfolioItem(customerKey)',
        description:
            'Returns the content of a Portfolio item identified by its customer/external key.',
        category: 'Content',
        params: [
            {
                name: 'customerKey',
                description: 'Customer key of the Portfolio item',
                type: 'string',
            },
        ],
        returnType: 'string',
        example: '%%=GetPortfolioItem("legal-disclaimer")=%%',
    },
    {
        name: 'GetPublishedSocialContent',
        syntax: 'GetPublishedSocialContent(regionID)',
        description: 'Retrieves previously published social content by its region identifier.',
        category: 'Social',
        params: [
            {
                name: 'regionID',
                description: 'ID of the published social content region',
                type: 'number',
            },
        ],
        returnType: 'string',
        example: '%%=GetPublishedSocialContent(42)=%%',
    },
    {
        name: 'GetSendTime',
        syntax: 'GetSendTime(useCompletedTime)',
        description:
            'Returns the date/time the email send was initiated (or completed). Time is in Central Standard Time.',
        category: 'Date and Time',
        params: [
            {
                name: 'useCompletedTime',
                description: 'Pass true to get completion time instead of start time',
                type: 'boolean',
                optional: true,
            },
        ],
        returnType: 'date',
        example: '%%[\n  set @sentAt = GetSendTime(false)\n]%%',
    },
    {
        name: 'GetSocialPublishURL',
        syntax: 'GetSocialPublishURL(socialNetworkCode, regionID, param1, param2...)',
        description:
            'Generates a social sharing URL/HTML snippet for a content impression region using a network code.',
        category: 'Social',
        params: [
            {
                name: 'socialNetworkCode',
                description: 'Numeric code for the social network',
                type: 'number',
            },
            { name: 'regionID', description: 'Impression region identifier', type: 'string' },
            {
                name: 'param1',
                description: 'Additional parameters',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%=GetSocialPublishURL(1, "deal-of-day")=%%',
    },
    {
        name: 'GetSocialPublishURLByName',
        syntax: 'GetSocialPublishURLByName(networkName, regionID, param1, param2...)',
        description:
            'Generates a social sharing URL/HTML snippet for a content impression region using a network name.',
        category: 'Social',
        params: [
            {
                name: 'networkName',
                description: 'Name of the social network (e.g. "Facebook")',
                type: 'string',
            },
            { name: 'regionID', description: 'Impression region identifier', type: 'string' },
            {
                name: 'param1',
                description: 'Additional parameters',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%=GetSocialPublishURLByName("Facebook", "deal-of-day")=%%',
    },
    {
        name: 'GetValue',
        syntax: 'GetValue(variableName)',
        description:
            'Returns the value of an AMPscript variable or subscriber attribute. Primarily used from Server-Side JavaScript context.',
        category: 'Utility',
        params: [
            {
                name: 'variableName',
                description: 'Variable or attribute name (without @ prefix in SSJS)',
                type: 'string',
            },
        ],
        returnType: 'string',
        example: '/* In SSJS: */\nvar name = Variable.GetValue("@displayName");',
    },
    {
        name: 'GUID',
        syntax: 'GUID()',
        description: 'Generates a new 36-character globally unique identifier string.',
        category: 'Utility',
        params: [],
        returnType: 'string',
        example:
            '%%[\n  set @uniqueId = GUID()\n  /* e.g. "a1b2c3d4-e5f6-7890-abcd-ef1234567890" */\n]%%',
    },
    {
        name: 'HTTPGet',
        syntax: 'HTTPGet(url, continueOnError, emptyOnError, headerName)',
        description:
            'Performs an HTTP GET request to a publicly accessible URL and returns the response body.',
        category: 'HTTP',
        params: [
            { name: 'url', description: 'Target URL', type: 'string' },
            {
                name: 'continueOnError',
                description: 'Whether to continue execution on HTTP error',
                type: 'boolean',
                optional: true,
            },
            {
                name: 'emptyOnError',
                description: 'Whether to return empty string on error',
                type: 'boolean',
                optional: true,
            },
            {
                name: 'headerName',
                description: 'Variable to receive response header values',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @response = HTTPGet("https://api.example.com/data")\n]%%',
    },
    {
        name: 'HTTPPost',
        syntax: 'HTTPPost(url, contentType, payload, responseVar, headerVar, headerName, headerValue...)',
        description:
            'Sends an HTTP POST request to a publicly accessible URL. Response body and headers can be captured in variables.',
        category: 'HTTP',
        params: [
            { name: 'url', description: 'Target URL', type: 'string' },
            { name: 'contentType', description: 'Content-Type header value', type: 'string' },
            { name: 'payload', description: 'Request body', type: 'string' },
            {
                name: 'responseVar',
                description: 'Variable name to store the response body',
                type: 'string',
            },
            {
                name: 'headerVar',
                description: 'Variable name for response headers',
                type: 'string',
                optional: true,
            },
            {
                name: 'headerName',
                description: 'Custom request header name',
                type: 'string',
                optional: true,
            },
            {
                name: 'headerValue',
                description: 'Custom request header value',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example:
            '%%[\n  HTTPPost("https://api.example.com/submit", "application/json", @body, @resp)\n]%%',
    },
    {
        name: 'HTTPPost2',
        syntax: 'HTTPPost2(url, contentType, payload, continueOnError, responseVar, headerVar, statusVar, headerName, headerValue...)',
        description:
            'Like HTTPPost, but adds error handling: captures response body and status separately even on HTTP errors.',
        category: 'HTTP',
        params: [
            { name: 'url', description: 'Target URL', type: 'string' },
            { name: 'contentType', description: 'Content-Type header value', type: 'string' },
            { name: 'payload', description: 'Request body', type: 'string' },
            { name: 'continueOnError', description: 'Whether to suppress errors', type: 'boolean' },
            { name: 'responseVar', description: 'Variable for response body', type: 'string' },
            { name: 'headerVar', description: 'Variable for response headers', type: 'string' },
            { name: 'statusVar', description: 'Variable for HTTP status code', type: 'string' },
            {
                name: 'headerName',
                description: 'Custom header name',
                type: 'string',
                optional: true,
            },
            {
                name: 'headerValue',
                description: 'Custom header value',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example:
            '%%[\n  HTTPPost2(@apiUrl, "application/json", @payload, true, @resp, @hdrs, @status)\n]%%',
    },
    {
        name: 'HTTPPostWithRetry',
        syntax: 'HTTPPostWithRetry(url, contentType, payload, maxRetries, responseVar, headerVar, statusVar, headerName, headerValue...)',
        description: 'Similar to HTTPPost2 but adds automatic retries on failure.',
        category: 'HTTP',
        params: [
            { name: 'url', description: 'Target URL', type: 'string' },
            { name: 'contentType', description: 'Content-Type header value', type: 'string' },
            { name: 'payload', description: 'Request body', type: 'string' },
            { name: 'maxRetries', description: 'Number of retry attempts', type: 'number' },
            { name: 'responseVar', description: 'Variable for response body', type: 'string' },
            { name: 'headerVar', description: 'Variable for response headers', type: 'string' },
            { name: 'statusVar', description: 'Variable for HTTP status code', type: 'string' },
            {
                name: 'headerName',
                description: 'Custom header name',
                type: 'string',
                optional: true,
            },
            {
                name: 'headerValue',
                description: 'Custom header value',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example:
            '%%[\n  HTTPPostWithRetry(@apiUrl, "application/json", @payload, 3, @resp, @hdrs, @status)\n]%%',
    },
    {
        name: 'HTTPRequestHeader',
        syntax: 'HTTPRequestHeader(headerName)',
        description:
            'Reads a specific header from the incoming HTTP request. Only available on landing pages and CloudPages.',
        category: 'HTTP',
        params: [
            { name: 'headerName', description: 'Name of the HTTP request header', type: 'string' },
        ],
        returnType: 'string',
        example: '%%[\n  set @userAgent = HTTPRequestHeader("User-Agent")\n]%%',
    },
    {
        name: 'IIf',
        syntax: 'IIf(condition, trueValue, falseValue)',
        description:
            'Inline conditional: returns the second argument when the condition is true, otherwise returns the third.',
        category: 'Utility',
        params: [
            { name: 'condition', description: 'Boolean expression to evaluate', type: 'boolean' },
            {
                name: 'trueValue',
                description: 'Value returned when condition is true',
                type: 'string',
            },
            {
                name: 'falseValue',
                description: 'Value returned when condition is false',
                type: 'string',
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @label = IIf(@qty > 1, "items", "item")\n]%%',
    },
    {
        name: 'Image',
        syntax: 'Image(imageIdentifier, altText)',
        description: 'Produces an HTML <img> tag from a Portfolio image asset.',
        category: 'Content',
        params: [
            { name: 'imageIdentifier', description: 'Portfolio image identifier', type: 'string' },
            {
                name: 'altText',
                description: 'Alt text for the image',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%=Image(@bannerAsset, "Seasonal banner")=%%',
    },
    {
        name: 'IndexOf',
        syntax: 'IndexOf(haystack, needle)',
        description:
            'Finds the 1-based position of the first occurrence of a substring within a string. Returns 0 if not found.',
        category: 'String',
        params: [
            { name: 'haystack', description: 'String to search within', type: 'string' },
            { name: 'needle', description: 'Substring to find', type: 'string' },
        ],
        returnType: 'number',
        example: '%%[\n  set @pos = IndexOf("marketing cloud", "cloud")\n  /* result: 11 */\n]%%',
    },
    {
        name: 'InsertData',
        syntax: 'InsertData(dataExtension, column1, value1, column2, value2...)',
        description:
            'Inserts a new row into a Data Extension. Returns 1 on success. Landing pages and CloudPages only.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'column1', description: 'First column name', type: 'string' },
            { name: 'value1', description: 'First column value', type: 'string' },
            {
                name: 'column2',
                description: 'Additional column name',
                type: 'string',
                optional: true,
            },
            {
                name: 'value2',
                description: 'Additional column value',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'number',
        example: '%%[\n  InsertData("FormSubmissions", "Email", @email, "Timestamp", Now())\n]%%',
    },
    {
        name: 'InsertDE',
        syntax: 'InsertDE(dataExtension, column1, value1, column2, value2...)',
        description:
            'Inserts a new row into a Data Extension during an email send. No return value.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'column1', description: 'First column name', type: 'string' },
            { name: 'value1', description: 'First column value', type: 'string' },
            {
                name: 'column2',
                description: 'Additional column name',
                type: 'string',
                optional: true,
            },
            {
                name: 'value2',
                description: 'Additional column value',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'void',
        example:
            '%%[\n  InsertDE("SendLog", "SubscriberKey", _subscriberKey, "SentDate", Now())\n]%%',
    },
    {
        name: 'InvokeCreate',
        syntax: 'InvokeCreate(apiObject, statusVar, messageVar, errorCodeVar)',
        description:
            'Executes a Create operation on a Marketing Cloud API object. Returns status, message and error code.',
        category: 'Marketing Cloud API',
        params: [
            { name: 'apiObject', description: 'API object to create', type: 'object' },
            { name: 'statusVar', description: 'Variable for status code', type: 'string' },
            { name: 'messageVar', description: 'Variable for status message', type: 'string' },
            { name: 'errorCodeVar', description: 'Variable for error code', type: 'string' },
        ],
        returnType: 'string',
        example: '%%[\n  set @stat = InvokeCreate(@deObj, @status, @msg, @errCode)\n]%%',
    },
    {
        name: 'InvokeDelete',
        syntax: 'InvokeDelete(apiObject, statusVar, messageVar, errorCodeVar)',
        description: 'Executes a Delete operation on a Marketing Cloud API object.',
        category: 'Marketing Cloud API',
        params: [
            { name: 'apiObject', description: 'API object to delete', type: 'object' },
            { name: 'statusVar', description: 'Variable for status code', type: 'string' },
            { name: 'messageVar', description: 'Variable for status message', type: 'string' },
            { name: 'errorCodeVar', description: 'Variable for error code', type: 'string' },
        ],
        returnType: 'string',
        example: '%%[\n  set @stat = InvokeDelete(@deObj, @status, @msg, @errCode)\n]%%',
    },
    {
        name: 'InvokeExecute',
        syntax: 'InvokeExecute(apiObject, statusVar, requestIdVar)',
        description: 'Executes an Execute operation on a Marketing Cloud API object.',
        category: 'Marketing Cloud API',
        params: [
            { name: 'apiObject', description: 'API object to execute', type: 'object' },
            { name: 'statusVar', description: 'Variable for status', type: 'string' },
            { name: 'requestIdVar', description: 'Variable for the Request ID', type: 'string' },
        ],
        returnType: 'string',
        example: '%%[\n  set @stat = InvokeExecute(@importDef, @status, @reqId)\n]%%',
    },
    {
        name: 'InvokePerform',
        syntax: 'InvokePerform(apiObject, action, statusVar)',
        description: 'Performs a named action on a Marketing Cloud API object (e.g. "start").',
        category: 'Marketing Cloud API',
        params: [
            { name: 'apiObject', description: 'API object to perform on', type: 'object' },
            { name: 'action', description: 'Action name (e.g. "start", "stop")', type: 'string' },
            { name: 'statusVar', description: 'Variable for status message', type: 'string' },
        ],
        returnType: 'string',
        example: '%%[\n  set @stat = InvokePerform(@ts, "start", @msg)\n]%%',
    },
    {
        name: 'InvokeRetrieve',
        syntax: 'InvokeRetrieve(retrieveRequest, statusVar, requestIdVar)',
        description:
            'Executes a Retrieve operation on a Marketing Cloud API RetrieveRequest object.',
        category: 'Marketing Cloud API',
        params: [
            { name: 'retrieveRequest', description: 'RetrieveRequest API object', type: 'object' },
            { name: 'statusVar', description: 'Variable for status message', type: 'string' },
            { name: 'requestIdVar', description: 'Variable for the Request ID', type: 'string' },
        ],
        returnType: 'rowset',
        example: '%%[\n  set @rows = InvokeRetrieve(@rr, @status, @reqId)\n]%%',
    },
    {
        name: 'InvokeUpdate',
        syntax: 'InvokeUpdate(apiObject, statusVar, messageVar, errorCodeVar)',
        description: 'Executes an Update operation on a Marketing Cloud API object.',
        category: 'Marketing Cloud API',
        params: [
            { name: 'apiObject', description: 'API object to update', type: 'object' },
            { name: 'statusVar', description: 'Variable for status code', type: 'string' },
            { name: 'messageVar', description: 'Variable for status message', type: 'string' },
            { name: 'errorCodeVar', description: 'Variable for error code', type: 'string' },
        ],
        returnType: 'string',
        example: '%%[\n  set @stat = InvokeUpdate(@deObj, @status, @msg, @errCode)\n]%%',
    },
    {
        name: 'IsCHTMLBrowser',
        syntax: 'IsCHTMLBrowser(userAgent)',
        description:
            'Checks if a user-agent string indicates a C-HTML (compact HTML) browser. Landing pages only.',
        category: 'Utility',
        params: [
            {
                name: 'userAgent',
                description: 'User-Agent header value to evaluate',
                type: 'string',
            },
        ],
        returnType: 'boolean',
        example: '%%[\n  set @isCHTML = IsCHTMLBrowser(HTTPRequestHeader("User-Agent"))\n]%%',
    },
    {
        name: 'IsEmailAddress',
        syntax: 'IsEmailAddress(value)',
        description: 'Validates whether a string conforms to standard email address syntax.',
        category: 'Utility',
        params: [{ name: 'value', description: 'String to validate', type: 'string' }],
        returnType: 'boolean',
        example:
            '%%[\n  if IsEmailAddress(@inputEmail) then\n    /* process valid email */\n  endif\n]%%',
    },
    {
        name: 'IsNull',
        syntax: 'IsNull(expression)',
        description:
            'Tests whether a value is null (but not empty string). Returns true if null, false otherwise.',
        category: 'Utility',
        params: [
            { name: 'expression', description: 'Value or expression to test', type: 'string' },
        ],
        returnType: 'boolean',
        example: '%%[\n  if IsNull(@optIn) then\n    set @optIn = false\n  endif\n]%%',
    },
    {
        name: 'IsNullDefault',
        syntax: 'IsNullDefault(expression, defaultValue)',
        description:
            'Returns the expression value if it is not empty; otherwise returns the specified default.',
        category: 'Utility',
        params: [
            { name: 'expression', description: 'Value to test', type: 'string' },
            {
                name: 'defaultValue',
                description: 'Fallback value if expression is null/empty',
                type: 'string',
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @city = IsNullDefault(@inputCity, "Unknown")\n]%%',
    },
    {
        name: 'IsPhoneNumber',
        syntax: 'IsPhoneNumber(value)',
        description: 'Checks whether a string matches a valid US phone number format.',
        category: 'Utility',
        params: [{ name: 'value', description: 'String to validate', type: 'string' }],
        returnType: 'boolean',
        example: '%%[\n  if IsPhoneNumber(@phone) then\n    /* process phone */\n  endif\n]%%',
    },
    {
        name: 'Length',
        syntax: 'Length(inputString)',
        description: 'Returns the number of characters in a string.',
        category: 'String',
        params: [{ name: 'inputString', description: 'The string to measure', type: 'string' }],
        returnType: 'number',
        example: '%%[\n  set @len = Length("Hello World")\n  /* result: 11 */\n]%%',
    },
    {
        name: 'LiveContentMicrositeURL',
        syntax: 'LiveContentMicrositeURL(pageId, liveContentId)',
        description: 'Generates a URL for displaying Live Content offers on a microsite page.',
        category: 'Content',
        params: [
            { name: 'pageId', description: 'Microsite page ID', type: 'string' },
            { name: 'liveContentId', description: 'Live Content asset ID', type: 'string' },
        ],
        returnType: 'string',
        example: '%%=LiveContentMicrositeURL(101, 202)=%%',
    },
    {
        name: 'LocalDateToSystemDate',
        syntax: 'LocalDateToSystemDate(localDate)',
        description:
            'Converts a local date/time to the Marketing Cloud system time zone (Central Standard Time).',
        category: 'Date and Time',
        params: [{ name: 'localDate', description: 'Local date value to convert', type: 'date' }],
        returnType: 'date',
        example: '%%[\n  set @cstDate = LocalDateToSystemDate(@localTimestamp)\n]%%',
    },
    {
        name: 'LongSFID',
        syntax: 'LongSFID(sfid15)',
        description:
            'Converts a 15-character case-sensitive Salesforce ID to its 18-character case-insensitive equivalent.',
        category: 'Sales and Service Cloud',
        params: [
            { name: 'sfid15', description: '15-character Salesforce record ID', type: 'string' },
        ],
        returnType: 'string',
        example: '%%[\n  set @sfid18 = LongSFID(@shortId)\n]%%',
    },
    {
        name: 'Lookup',
        syntax: 'Lookup(dataExtension, returnColumn, searchColumn, searchValue, searchColumn2, searchValue2...)',
        description:
            'Returns a single column value from the first matching row in a Data Extension.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            {
                name: 'returnColumn',
                description: 'Column to return the value from',
                type: 'string',
            },
            { name: 'searchColumn', description: 'Column to match on', type: 'string' },
            { name: 'searchValue', description: 'Value to match', type: 'string' },
            {
                name: 'searchColumn2',
                description: 'Additional search column',
                type: 'string',
                optional: true,
            },
            {
                name: 'searchValue2',
                description: 'Additional search value',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example:
            '%%[\n  set @region = Lookup("MemberDirectory", "Territory", "MemberId", @memberId)\n]%%',
    },
    {
        name: 'LookupOrderedRows',
        syntax: 'LookupOrderedRows(dataExtension, maxRows, sortColumn, searchColumn, searchValue...)',
        description:
            'Returns a sorted set of rows from a Data Extension, limited to a maximum count.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'maxRows', description: 'Maximum rows to return', type: 'number' },
            {
                name: 'sortColumn',
                description: 'Column and direction (e.g. "CreatedDate DESC")',
                type: 'string',
            },
            { name: 'searchColumn', description: 'Column to filter on', type: 'string' },
            { name: 'searchValue', description: 'Value to match', type: 'string' },
        ],
        returnType: 'rowset',
        example:
            '%%[\n  set @orders = LookupOrderedRows("Orders", 5, "OrderDate DESC", "CustomerId", @custId)\n]%%',
    },
    {
        name: 'LookupOrderedRowsCS',
        syntax: 'LookupOrderedRowsCS(dataExtension, maxRows, sortColumn, searchColumn, searchValue...)',
        description: 'Case-sensitive version of LookupOrderedRows.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'maxRows', description: 'Maximum rows to return', type: 'number' },
            { name: 'sortColumn', description: 'Column and direction', type: 'string' },
            { name: 'searchColumn', description: 'Column to filter on', type: 'string' },
            { name: 'searchValue', description: 'Value to match (case-sensitive)', type: 'string' },
        ],
        returnType: 'rowset',
        example:
            '%%[\n  set @matches = LookupOrderedRowsCS("Products", 10, "Name ASC", "SKU", @sku)\n]%%',
    },
    {
        name: 'LookupRows',
        syntax: 'LookupRows(dataExtension, searchColumn, searchValue, searchColumn2, searchValue2...)',
        description: 'Returns all matching rows from a Data Extension as an unordered row set.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'searchColumn', description: 'Column to match on', type: 'string' },
            { name: 'searchValue', description: 'Value to match', type: 'string' },
            {
                name: 'searchColumn2',
                description: 'Additional search column',
                type: 'string',
                optional: true,
            },
            {
                name: 'searchValue2',
                description: 'Additional search value',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'rowset',
        example:
            '%%[\n  set @rows = LookupRows("Preferences", "SubscriberKey", _subscriberKey)\n]%%',
    },
    {
        name: 'LookupRowsCS',
        syntax: 'LookupRowsCS(dataExtension, searchColumn, searchValue, searchColumn2, searchValue2...)',
        description: 'Case-sensitive version of LookupRows.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'searchColumn', description: 'Column to match on', type: 'string' },
            { name: 'searchValue', description: 'Value to match (case-sensitive)', type: 'string' },
            {
                name: 'searchColumn2',
                description: 'Additional search column',
                type: 'string',
                optional: true,
            },
            {
                name: 'searchValue2',
                description: 'Additional search value',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'rowset',
        example: '%%[\n  set @exact = LookupRowsCS("Tags", "Label", "VIP")\n]%%',
    },
    {
        name: 'Lowercase',
        syntax: 'Lowercase(inputString)',
        description: 'Converts every uppercase character in a string to lowercase.',
        category: 'String',
        params: [{ name: 'inputString', description: 'String to convert', type: 'string' }],
        returnType: 'string',
        example: '%%[\n  set @lower = Lowercase("HELLO")\n  /* result: "hello" */\n]%%',
    },
    {
        name: 'MD5',
        syntax: 'MD5(inputString, encoding)',
        description: 'Produces a 32-character hexadecimal MD5 hash of the input string.',
        category: 'Encryption and Encoding',
        params: [
            { name: 'inputString', description: 'String to hash', type: 'string' },
            { name: 'encoding', description: 'Character encoding', type: 'string', optional: true },
        ],
        returnType: 'string',
        example: '%%[\n  set @hash = MD5(@emailAddr)\n]%%',
    },
    {
        name: 'MicrositeURL',
        syntax: 'MicrositeURL(pageID, param1Name, param1Value...)',
        description:
            'Builds an encrypted URL to a Classic microsite page with optional name/value parameters.',
        category: 'Utility',
        params: [
            { name: 'pageID', description: 'Numeric microsite page ID', type: 'number' },
            {
                name: 'param1Name',
                description: 'First query parameter name',
                type: 'string',
                optional: true,
            },
            {
                name: 'param1Value',
                description: 'First query parameter value',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @link = MicrositeURL(55, "ref", @campaignId)\n]%%',
    },
    {
        name: 'Mod',
        syntax: 'Mod(dividend, divisor)',
        description:
            'Returns the remainder of dividing the first number by the second (modulo operation).',
        category: 'Math',
        params: [
            { name: 'dividend', description: 'The number to divide', type: 'number' },
            { name: 'divisor', description: 'The divisor', type: 'number' },
        ],
        returnType: 'number',
        example: '%%[\n  set @isEven = IIf(Mod(@index, 2) == 0, "even", "odd")\n]%%',
    },
    {
        name: 'Multiply',
        syntax: 'Multiply(factor1, factor2)',
        description: 'Multiplies two numbers and returns the product.',
        category: 'Math',
        params: [
            { name: 'factor1', description: 'First factor', type: 'number' },
            { name: 'factor2', description: 'Second factor', type: 'number' },
        ],
        returnType: 'number',
        example: '%%[\n  set @lineTotal = Multiply(@unitPrice, @quantity)\n]%%',
    },
    {
        name: 'Now',
        syntax: 'Now(preserveSendTime)',
        description:
            'Returns the current system date/time in Central Standard Time. Optionally preserves the original send time.',
        category: 'Date and Time',
        params: [
            {
                name: 'preserveSendTime',
                description:
                    'If true, returns the date/time of the initial send rather than current time',
                type: 'boolean',
                optional: true,
            },
        ],
        returnType: 'date',
        example: '%%[\n  set @today = Now()\n]%%',
    },
    {
        name: 'Output',
        syntax: 'Output(content)',
        description:
            "Writes a value to the rendered output at the script block's position. Commonly used for debugging.",
        category: 'Utility',
        params: [{ name: 'content', description: 'Value or expression to output', type: 'string' }],
        returnType: 'void',
        example: '%%[\n  Output(Concat("Debug: @userId = ", @userId))\n]%%',
    },
    {
        name: 'OutputLine',
        syntax: 'OutputLine(content)',
        description: 'Same as Output but appends a line feed character after the rendered value.',
        category: 'Utility',
        params: [{ name: 'content', description: 'Value or expression to output', type: 'string' }],
        returnType: 'void',
        example: '%%[\n  OutputLine(Concat("Row ", @i, ": ", @val))\n]%%',
    },
    {
        name: 'ProperCase',
        syntax: 'ProperCase(inputString)',
        description:
            'Capitalizes the first letter of each word and lowercases all other characters.',
        category: 'String',
        params: [{ name: 'inputString', description: 'String to convert', type: 'string' }],
        returnType: 'string',
        example: '%%[\n  set @name = ProperCase("jane doe")\n  /* result: "Jane Doe" */\n]%%',
    },
    {
        name: 'QueryParameter',
        syntax: 'QueryParameter(parameterName)',
        description: "Extracts a named value from the current page URL's query string.",
        category: 'Utility',
        params: [
            {
                name: 'parameterName',
                description: 'The query string parameter key',
                type: 'string',
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @campaign = QueryParameter("utm_campaign")\n]%%',
    },
    {
        name: 'RaiseError',
        syntax: 'RaiseError(message, skipSend, apiError, errorCode, isTransient)',
        description:
            'Halts processing and optionally suppresses or cancels an email send for the current subscriber. Useful for exception handling.',
        category: 'Utility',
        params: [
            { name: 'message', description: 'Error message text', type: 'string' },
            {
                name: 'skipSend',
                description: 'Whether to skip the send for this subscriber',
                type: 'boolean',
                optional: true,
            },
            {
                name: 'apiError',
                description: 'Whether this is an API-facing error',
                type: 'boolean',
                optional: true,
            },
            {
                name: 'errorCode',
                description: 'Numeric error code',
                type: 'number',
                optional: true,
            },
            {
                name: 'isTransient',
                description: 'Whether the error is transient/retryable',
                type: 'boolean',
                optional: true,
            },
        ],
        returnType: 'void',
        example:
            '%%[\n  if Empty(@requiredField) then\n    RaiseError("Missing required data", true)\n  endif\n]%%',
    },
    {
        name: 'Random',
        syntax: 'Random(lowerBound, upperBound)',
        description: 'Generates a random integer between the lower and upper bounds (inclusive).',
        category: 'Math',
        params: [
            { name: 'lowerBound', description: 'Minimum value (inclusive)', type: 'number' },
            { name: 'upperBound', description: 'Maximum value (inclusive)', type: 'number' },
        ],
        returnType: 'number',
        example: '%%[\n  set @dice = Random(1, 6)\n]%%',
    },
    {
        name: 'RatingStars',
        syntax: 'RatingStars(rating, maxStars, imageUrl)',
        description:
            'Renders a star-rating image for Einstein Email Recommendations based on a product rating.',
        category: 'Einstein Email Recommendations',
        params: [
            { name: 'rating', description: 'Numeric rating value', type: 'number' },
            { name: 'maxStars', description: 'Maximum number of stars', type: 'number' },
            { name: 'imageUrl', description: 'URL template for star images', type: 'string' },
        ],
        returnType: 'string',
        example: '%%=RatingStars(@productRating, 5, @starImgUrl)=%%',
    },
    {
        name: 'Redirect',
        syntax: 'Redirect(url)',
        description: 'Immediately redirects the visitor to the specified URL. Landing pages only.',
        category: 'Utility',
        params: [{ name: 'url', description: 'Destination URL', type: 'string' }],
        returnType: 'void',
        example: '%%[\n  Redirect("https://www.example.com/thank-you")\n]%%',
    },
    {
        name: 'RedirectTo',
        syntax: 'RedirectTo(url)',
        description:
            'Wraps a dynamic URL for use as a tracked hyperlink in emails. Required when the href is a variable or expression.',
        category: 'Utility',
        params: [
            { name: 'url', description: 'URL value (variable or expression)', type: 'string' },
        ],
        returnType: 'string',
        example: '<a href="%%=RedirectTo(@profileUrl)=%%">View Profile</a>',
    },
    {
        name: 'RegExMatch',
        syntax: 'RegExMatch(inputString, pattern, matchGroup, additionalGroups...)',
        description:
            'Applies a regular expression to a string and returns the first match (or a specific capture group).',
        category: 'String',
        params: [
            { name: 'inputString', description: 'String to search', type: 'string' },
            { name: 'pattern', description: 'Regular expression pattern', type: 'string' },
            {
                name: 'matchGroup',
                description: 'Variable to hold match/group value',
                type: 'string',
            },
            {
                name: 'additionalGroups',
                description: 'Additional capture group variables',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example:
            '%%[\n  set @match = RegExMatch(@input, "^(\\\\d{3})-(\\\\d{4})$", @full, @area, @num)\n]%%',
    },
    {
        name: 'Replace',
        syntax: 'Replace(inputString, searchString, replacementString)',
        description:
            'Replaces all occurrences of a search string within the input with the replacement string.',
        category: 'String',
        params: [
            { name: 'inputString', description: 'Original string', type: 'string' },
            { name: 'searchString', description: 'Substring to find', type: 'string' },
            { name: 'replacementString', description: 'Replacement text', type: 'string' },
        ],
        returnType: 'string',
        example: '%%[\n  set @clean = Replace(@rawText, "&amp;", "&")\n]%%',
    },
    {
        name: 'ReplaceList',
        syntax: 'ReplaceList(inputString, searchString, replacement1, replacement2...)',
        description:
            'Replaces the search string with each replacement value in succession across the input.',
        category: 'String',
        params: [
            {
                name: 'inputString',
                description: 'Original string containing placeholders',
                type: 'string',
            },
            {
                name: 'searchString',
                description: 'Placeholder substring to replace',
                type: 'string',
            },
            { name: 'replacement1', description: 'First replacement value', type: 'string' },
            {
                name: 'replacement2',
                description: 'Subsequent replacement values',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example:
            '%%[\n  set @out = ReplaceList("? and ? and ?", "?", "A", "B", "C")\n  /* result: "A and B and C" */\n]%%',
    },
    {
        name: 'RequestParameter',
        syntax: 'RequestParameter(parameterName)',
        description: 'Retrieves a value from the URL query string or from a submitted form field.',
        category: 'Utility',
        params: [
            { name: 'parameterName', description: 'Parameter or form field name', type: 'string' },
        ],
        returnType: 'string',
        example: '%%[\n  set @submittedEmail = RequestParameter("email")\n]%%',
    },
    {
        name: 'RetrieveMSCRMRecords',
        syntax: 'RetrieveMSCRMRecords(entityName, columnList, filterColumn, filterOperator, filterValue)',
        description: 'Queries rows from a Microsoft Dynamics CRM entity.',
        category: 'Microsoft Dynamics CRM',
        params: [
            { name: 'entityName', description: 'CRM entity logical name', type: 'string' },
            {
                name: 'columnList',
                description: 'Comma-separated list of columns to retrieve',
                type: 'string',
            },
            { name: 'filterColumn', description: 'Column to filter on', type: 'string' },
            { name: 'filterOperator', description: 'Comparison operator', type: 'string' },
            { name: 'filterValue', description: 'Value to filter by', type: 'string' },
        ],
        returnType: 'rowset',
        example:
            '%%[\n  set @contacts = RetrieveMSCRMRecords("contact", "firstname,email", "statecode", "=", "0")\n]%%',
    },
    {
        name: 'RetrieveMSCRMRecordsFetchXML',
        syntax: 'RetrieveMSCRMRecordsFetchXML(fetchXml)',
        description: 'Queries a Dynamics CRM org using a raw FetchXML query string.',
        category: 'Microsoft Dynamics CRM',
        params: [{ name: 'fetchXml', description: 'FetchXML query string', type: 'string' }],
        returnType: 'rowset',
        example: '%%[\n  set @data = RetrieveMSCRMRecordsFetchXML(@fetchQuery)\n]%%',
    },
    {
        name: 'RetrieveSalesforceJobSources',
        syntax: 'RetrieveSalesforceJobSources(jobId)',
        description:
            'Returns details about the audience sources for a Salesforce-triggered send job.',
        category: 'Sales and Service Cloud',
        params: [{ name: 'jobId', description: 'Job identifier', type: 'number' }],
        returnType: 'rowset',
        example: '%%[\n  set @sources = RetrieveSalesforceJobSources(@jobId)\n]%%',
    },
    {
        name: 'RetrieveSalesforceObjects',
        syntax: 'RetrieveSalesforceObjects(objectName, fieldList, filterField, operator, filterValue, additionalFilters...)',
        description:
            'Queries records from a Salesforce standard or custom object and returns them as a row set.',
        category: 'Sales and Service Cloud',
        params: [
            { name: 'objectName', description: 'Salesforce object API name', type: 'string' },
            {
                name: 'fieldList',
                description: 'Comma-separated field names to retrieve',
                type: 'string',
            },
            { name: 'filterField', description: 'Field to filter on', type: 'string' },
            {
                name: 'operator',
                description: 'Comparison operator (e.g. "=", ">")',
                type: 'string',
            },
            { name: 'filterValue', description: 'Value to compare against', type: 'string' },
            {
                name: 'additionalFilters',
                description: 'Additional filter triplets',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'rowset',
        example:
            '%%[\n  set @opps = RetrieveSalesforceObjects("Opportunity", "Id,Name", "StageName", "=", "Closed Won")\n]%%',
    },
    {
        name: 'Row',
        syntax: 'Row(rowSet, index)',
        description: 'Extracts a single row from a row set by its 1-based index.',
        category: 'Data Extension',
        params: [
            { name: 'rowSet', description: 'Row set to read from', type: 'rowset' },
            { name: 'index', description: '1-based row index', type: 'number' },
        ],
        returnType: 'row',
        example: '%%[\n  set @firstRow = Row(@results, 1)\n]%%',
    },
    {
        name: 'RowCount',
        syntax: 'RowCount(rowSet)',
        description: 'Returns the number of rows in a row set.',
        category: 'Data Extension',
        params: [{ name: 'rowSet', description: 'Row set to count', type: 'rowset' }],
        returnType: 'number',
        example: '%%[\n  set @count = RowCount(@results)\n]%%',
    },
    {
        name: 'SetObjectProperty',
        syntax: 'SetObjectProperty(apiObject, propertyName, value)',
        description:
            'Assigns a value to a property on a Marketing Cloud API object created with CreateObject.',
        category: 'Marketing Cloud API',
        params: [
            { name: 'apiObject', description: 'API object reference', type: 'object' },
            { name: 'propertyName', description: 'Property name to set', type: 'string' },
            { name: 'value', description: 'Value to assign', type: 'string' },
        ],
        returnType: 'void',
        example: '%%[\n  SetObjectProperty(@ts, "TriggeredSendDefinition", @tsDef)\n]%%',
    },
    {
        name: 'SetSmsConversationNextKeyword',
        syntax: 'SetSmsConversationNextKeyword(shortCode, mobileNumber, nextKeyword)',
        description: 'Changes the expected next keyword in an ongoing SMS conversation.',
        category: 'MobileConnect',
        params: [
            { name: 'shortCode', description: 'Short or long code', type: 'string' },
            { name: 'mobileNumber', description: 'Contact mobile number', type: 'string' },
            { name: 'nextKeyword', description: 'New keyword to expect next', type: 'string' },
        ],
        returnType: 'boolean',
        example: '%%[\n  SetSmsConversationNextKeyword("12345", @mobile, "YES")\n]%%',
    },
    {
        name: 'SetStateMSCRMRecord',
        syntax: 'SetStateMSCRMRecord(entityName, entityId, state, status)',
        description: 'Updates the state and status of a specific Microsoft Dynamics CRM record.',
        category: 'Microsoft Dynamics CRM',
        params: [
            { name: 'entityName', description: 'Entity logical name', type: 'string' },
            { name: 'entityId', description: 'Record GUID', type: 'string' },
            { name: 'state', description: 'State code value', type: 'string' },
            { name: 'status', description: 'Status code value', type: 'string' },
        ],
        returnType: 'void',
        example: '%%[\n  SetStateMSCRMRecord("incident", @caseId, 1, 5)\n]%%',
    },
    {
        name: 'SetValue',
        syntax: 'SetValue(variableName, value)',
        description:
            'Sets the value of an AMPscript variable from within a Server-Side JavaScript block.',
        category: 'Utility',
        params: [
            {
                name: 'variableName',
                description: 'Variable name (without @ in SSJS)',
                type: 'string',
            },
            { name: 'value', description: 'Value to assign', type: 'string' },
        ],
        returnType: 'void',
        example: '/* In SSJS: */\nVariable.SetValue("@greeting", "Welcome back!");',
    },
    {
        name: 'SHA1',
        syntax: 'SHA1(inputString, encoding)',
        description: 'Produces a SHA-1 hash of the input string as a hexadecimal string.',
        category: 'Encryption and Encoding',
        params: [
            { name: 'inputString', description: 'String to hash', type: 'string' },
            { name: 'encoding', description: 'Character encoding', type: 'string', optional: true },
        ],
        returnType: 'string',
        example: '%%[\n  set @sha = SHA1(@payload)\n]%%',
    },
    {
        name: 'SHA256',
        syntax: 'SHA256(inputString, encoding)',
        description: 'Produces a SHA-256 hash of the input string as a hexadecimal string.',
        category: 'Encryption and Encoding',
        params: [
            { name: 'inputString', description: 'String to hash', type: 'string' },
            { name: 'encoding', description: 'Character encoding', type: 'string', optional: true },
        ],
        returnType: 'string',
        example: '%%[\n  set @sig = SHA256(Concat(@ts, @secret))\n]%%',
    },
    {
        name: 'SHA512',
        syntax: 'SHA512(inputString, encoding)',
        description: 'Produces a SHA-512 hash of the input string as a hexadecimal string.',
        category: 'Encryption and Encoding',
        params: [
            { name: 'inputString', description: 'String to hash', type: 'string' },
            { name: 'encoding', description: 'Character encoding', type: 'string', optional: true },
        ],
        returnType: 'string',
        example: '%%[\n  set @digest = SHA512(@data)\n]%%',
    },
    {
        name: 'StringToDate',
        syntax: 'StringToDate(dateString, format)',
        description:
            'Parses a date string using the specified format and returns a DateTime object.',
        category: 'Date and Time',
        params: [
            {
                name: 'dateString',
                description: 'String representation of the date',
                type: 'string',
            },
            { name: 'format', description: 'Date format pattern', type: 'string', optional: true },
        ],
        returnType: 'date',
        example: '%%[\n  set @dt = StringToDate("15/03/2026", "dd/MM/yyyy")\n]%%',
    },
    {
        name: 'StringToHex',
        syntax: 'StringToHex(inputString, encoding)',
        description: 'Converts each character in a string to its hexadecimal representation.',
        category: 'Encryption and Encoding',
        params: [
            { name: 'inputString', description: 'String to convert', type: 'string' },
            { name: 'encoding', description: 'Character encoding', type: 'string', optional: true },
        ],
        returnType: 'string',
        example: '%%[\n  set @hex = StringToHex("ABC")\n]%%',
    },
    {
        name: 'Substring',
        syntax: 'Substring(inputString, startIndex, length)',
        description:
            'Extracts a portion of a string starting at the given 1-based position for the specified number of characters.',
        category: 'String',
        params: [
            { name: 'inputString', description: 'Source string', type: 'string' },
            { name: 'startIndex', description: '1-based starting position', type: 'number' },
            { name: 'length', description: 'Number of characters to extract', type: 'number', optional: true },
        ],
        returnType: 'string',
        example: '%%[\n  set @areaCode = Substring("5551234567", 1, 3)\n  /* result: "555" */\n]%%',
    },
    {
        name: 'Subtract',
        syntax: 'Subtract(number1, number2)',
        description: 'Subtracts the second number from the first and returns the difference.',
        category: 'Math',
        params: [
            { name: 'number1', description: 'The minuend', type: 'number' },
            { name: 'number2', description: 'The subtrahend', type: 'number' },
        ],
        returnType: 'number',
        example: '%%[\n  set @remaining = Subtract(@balance, @payment)\n]%%',
    },
    {
        name: 'SystemDateToLocalDate',
        syntax: 'SystemDateToLocalDate(systemDate)',
        description:
            "Converts a Marketing Cloud system date (CST) to the subscriber's local time zone.",
        category: 'Date and Time',
        params: [
            { name: 'systemDate', description: 'System date in CST to convert', type: 'date' },
        ],
        returnType: 'date',
        example: '%%[\n  set @localNow = SystemDateToLocalDate(Now())\n]%%',
    },
    {
        name: 'TransformXML',
        syntax: 'TransformXML(xmlData, xslTemplate)',
        description:
            'Applies an XSLT stylesheet transformation to XML data and returns the result.',
        category: 'Content',
        params: [
            { name: 'xmlData', description: 'Source XML string', type: 'string' },
            {
                name: 'xslTemplate',
                description: 'XSL transformation template string',
                type: 'string',
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @html = TransformXML(@catalogXml, @xslSheet)\n]%%',
    },
    {
        name: 'TreatAsContent',
        syntax: 'TreatAsContent(contentString)',
        description:
            'Forces AMPscript and personalization strings within the given string to be parsed and evaluated.',
        category: 'Content',
        params: [
            {
                name: 'contentString',
                description: 'String containing AMPscript to evaluate',
                type: 'string',
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @dynamic = TreatAsContent(@templateHtml)\n]%%',
    },
    {
        name: 'TreatAsContentArea',
        syntax: 'TreatAsContentArea(key, contentString, impressionRegion)',
        description:
            'Creates a cached content area from a string (up to 300 unique variants per send) and evaluates embedded AMPscript.',
        category: 'Content',
        params: [
            { name: 'key', description: 'Cache key for the content variant', type: 'string' },
            { name: 'contentString', description: 'HTML/AMPscript content', type: 'string' },
            {
                name: 'impressionRegion',
                description: 'Impression region name',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%[\n  TreatAsContentArea(@segmentKey, @segmentHtml)\n]%%',
    },
    {
        name: 'Trim',
        syntax: 'Trim(inputString)',
        description: 'Strips leading and trailing whitespace from a string.',
        category: 'String',
        params: [{ name: 'inputString', description: 'String to trim', type: 'string' }],
        returnType: 'string',
        example: '%%[\n  set @clean = Trim("  hello  ")\n  /* result: "hello" */\n]%%',
    },
    {
        name: 'UpdateData',
        syntax: 'UpdateData(dataExtension, keyCount, keyColumn, keyValue, column1, value1...)',
        description:
            'Updates matching rows in a Data Extension. Returns count of rows updated. Landing pages and CloudPages only.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'keyCount', description: 'Number of key column/value pairs', type: 'number' },
            { name: 'keyColumn', description: 'Key column name for matching', type: 'string' },
            { name: 'keyValue', description: 'Key value to match', type: 'string' },
            { name: 'column1', description: 'Column to update', type: 'string' },
            { name: 'value1', description: 'New value for column1', type: 'string' },
        ],
        returnType: 'number',
        example: '%%[\n  UpdateData("Profiles", 1, "Email", @email, "LastLogin", Now())\n]%%',
    },
    {
        name: 'UpdateDE',
        syntax: 'UpdateDE(dataExtension, keyCount, keyColumn, keyValue, column1, value1...)',
        description:
            'Updates matching rows in a Data Extension during email sends. No return value.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'keyCount', description: 'Number of key column/value pairs', type: 'number' },
            { name: 'keyColumn', description: 'Key column name', type: 'string' },
            { name: 'keyValue', description: 'Key value to match', type: 'string' },
            { name: 'column1', description: 'Column to update', type: 'string' },
            { name: 'value1', description: 'New value', type: 'string' },
        ],
        returnType: 'void',
        example:
            '%%[\n  UpdateDE("SendTracker", 1, "SubscriberKey", _subscriberKey, "Opens", Add(@opens, 1))\n]%%',
    },
    {
        name: 'UpdateMSCRMRecords',
        syntax: 'UpdateMSCRMRecords(entityName, setFields, filterColumn, filterValue)',
        description:
            'Updates one or more records in a Dynamics CRM entity that match the filter. Returns the number updated.',
        category: 'Microsoft Dynamics CRM',
        params: [
            { name: 'entityName', description: 'CRM entity logical name', type: 'string' },
            {
                name: 'setFields',
                description: 'Comma-separated field=value pairs to set',
                type: 'string',
            },
            { name: 'filterColumn', description: 'Column to filter on', type: 'string' },
            { name: 'filterValue', description: 'Value to match', type: 'string' },
        ],
        returnType: 'number',
        example:
            '%%[\n  set @updated = UpdateMSCRMRecords("contact", "statecode=0", "emailaddress1", @email)\n]%%',
    },
    {
        name: 'UpdateSingleSalesforceObject',
        syntax: 'UpdateSingleSalesforceObject(objectName, recordId, fieldName1, fieldValue1...)',
        description:
            'Updates a single Salesforce object record. Returns 1 on success, 0 on failure.',
        category: 'Sales and Service Cloud',
        params: [
            { name: 'objectName', description: 'Salesforce object API name', type: 'string' },
            { name: 'recordId', description: '18-character Salesforce record ID', type: 'string' },
            { name: 'fieldName1', description: 'First field to update', type: 'string' },
            { name: 'fieldValue1', description: 'New value for the first field', type: 'string' },
            {
                name: 'fieldNameN',
                description: 'Additional field name (repeatable)',
                type: 'string',
                optional: true,
            },
            {
                name: 'fieldValueN',
                description: 'Value for the additional field (repeatable)',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'number',
        example:
            '%%[\n  set @ok = UpdateSingleSalesforceObject("Contact", @sfId, "HasOptedOutOfEmail", "true")\n]%%',
    },
    {
        name: 'Uppercase',
        syntax: 'Uppercase(inputString)',
        description: 'Converts every lowercase character in a string to uppercase.',
        category: 'String',
        params: [{ name: 'inputString', description: 'String to convert', type: 'string' }],
        returnType: 'string',
        example: '%%[\n  set @upper = Uppercase("hello")\n  /* result: "HELLO" */\n]%%',
    },
    {
        name: 'UpsertContact',
        syntax: 'UpsertContact(contactKey, keyColumn, keyValue, lookupColumn, lookupValue, fieldName, fieldValue...)',
        description:
            'Creates a new Contact or updates an existing one in Marketing Cloud. Currently mobile-only.',
        category: 'MobileConnect',
        params: [
            { name: 'contactKey', description: 'Contact key identifier', type: 'string' },
            { name: 'keyColumn', description: 'Key column', type: 'string' },
            { name: 'keyValue', description: 'Key value', type: 'string' },
            { name: 'lookupColumn', description: 'Lookup column name', type: 'string' },
            { name: 'lookupValue', description: 'Lookup value', type: 'string' },
            { name: 'fieldName', description: 'Field to set', type: 'string', optional: true },
            { name: 'fieldValue', description: 'Field value', type: 'string', optional: true },
        ],
        returnType: 'void',
        example:
            '%%[\n  UpsertContact(@contactKey, "MobileNumber", @phone, "MobileNumber", @phone)\n]%%',
    },
    {
        name: 'UpsertData',
        syntax: 'UpsertData(dataExtension, keyCount, keyColumn, keyValue, column1, value1...)',
        description:
            'Inserts a new row or updates an existing one in a Data Extension. Returns 1 on insert, 2 on update. Landing pages/CloudPages only.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'keyCount', description: 'Number of key column/value pairs', type: 'number' },
            { name: 'keyColumn', description: 'Key column name', type: 'string' },
            { name: 'keyValue', description: 'Key value for matching', type: 'string' },
            { name: 'column1', description: 'Column to set', type: 'string' },
            { name: 'value1', description: 'Value to assign', type: 'string' },
        ],
        returnType: 'number',
        example:
            '%%[\n  UpsertData("Preferences", 1, "Email", @email, "OptIn", "true", "UpdatedAt", Now())\n]%%',
    },
    {
        name: 'UpsertDE',
        syntax: 'UpsertDE(dataExtension, keyCount, keyColumn, keyValue, column1, value1...)',
        description:
            'Inserts or updates a row in a Data Extension during email sends. No return value.',
        category: 'Data Extension',
        params: [
            { name: 'dataExtension', description: 'Name of the Data Extension', type: 'string' },
            { name: 'keyCount', description: 'Number of key column/value pairs', type: 'number' },
            { name: 'keyColumn', description: 'Key column name', type: 'string' },
            { name: 'keyValue', description: 'Key value for matching', type: 'string' },
            { name: 'column1', description: 'Column to set', type: 'string' },
            { name: 'value1', description: 'Value to assign', type: 'string' },
        ],
        returnType: 'void',
        example:
            '%%[\n  UpsertDE("EngagementLog", 1, "SubscriberKey", _subscriberKey, "LastSent", Now())\n]%%',
    },
    {
        name: 'UpsertMSCRMRecord',
        syntax: 'UpsertMSCRMRecord(entityName, filterField1, filterValue1, filterField2, filterValue2, setField1, setValue1, setField2, setValue2)',
        description:
            'Updates an existing CRM record that matches the filter criteria, or creates a new one. Returns the record GUID.',
        category: 'Microsoft Dynamics CRM',
        params: [
            { name: 'entityName', description: 'CRM entity logical name', type: 'string' },
            { name: 'filterField1', description: 'First filter field', type: 'string' },
            { name: 'filterValue1', description: 'First filter value', type: 'string' },
            { name: 'filterField2', description: 'Second filter field', type: 'string' },
            { name: 'filterValue2', description: 'Second filter value', type: 'string' },
            { name: 'setField1', description: 'First field to set', type: 'string' },
            { name: 'setValue1', description: 'Value for first field', type: 'string' },
            { name: 'setField2', description: 'Second field to set', type: 'string' },
            { name: 'setValue2', description: 'Value for second field', type: 'string' },
        ],
        returnType: 'string',
        example:
            '%%[\n  set @guid = UpsertMSCRMRecord("contact", "email", @email, "", "", "firstname", @fName, "lastname", @lName)\n]%%',
    },
    {
        name: 'URLEncode',
        syntax: 'URLEncode(inputString, convertToHex, charset)',
        description: 'Percent-encodes a string so it can be safely used as a URL parameter value.',
        category: 'Encryption and Encoding',
        params: [
            { name: 'inputString', description: 'String to encode', type: 'string' },
            {
                name: 'convertToHex',
                description: 'Whether to use hex encoding',
                type: 'boolean',
                optional: true,
            },
            {
                name: 'charset',
                description: 'Character set to use',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%[\n  set @encoded = URLEncode(@searchQuery)\n]%%',
    },
    {
        name: 'V',
        syntax: 'V(variable)',
        description:
            'Outputs the value of an AMPscript variable. Typically used in inline expressions to display variable values.',
        category: 'Utility',
        params: [{ name: 'variable', description: 'AMPscript variable reference', type: 'string' }],
        returnType: 'string',
        example: '<p>Hello, %%=V(@displayName)=%%!</p>',
    },
    {
        name: 'WAT',
        syntax: 'WAT(trackingId, param1, param2...)',
        description:
            'Generates Web Analytics Tracking parameter strings that can be appended to URLs.',
        category: 'Utility',
        params: [
            {
                name: 'trackingId',
                description: 'Web Analytics Tracking configuration ID',
                type: 'string',
            },
            {
                name: 'param1',
                description: 'First parameter replacement value',
                type: 'string',
                optional: true,
            },
            {
                name: 'param2',
                description: 'Additional parameter values',
                type: 'string',
                optional: true,
            },
        ],
        returnType: 'string',
        example: '%%=WAT(1, @campaignName, @channelId)=%%',
    },
    {
        name: 'WATP',
        syntax: 'WATP(ordinal)',
        description:
            'Placeholder function for WAT parameter values. Replaced at render time within WAT strings.',
        category: 'Utility',
        params: [
            {
                name: 'ordinal',
                description: 'Ordinal position (1-based) of the parameter',
                type: 'number',
            },
        ],
        returnType: 'string',
        example: '/* Used inside WAT configuration strings */\nWATP(1)',
    },
    {
        name: 'WrapLongURL',
        syntax: 'WrapLongURL(url)',
        description:
            'Shortens URLs exceeding 975 characters by replacing them with a platform redirect, preventing broken links in Outlook.',
        category: 'Utility',
        params: [{ name: 'url', description: 'Potentially long URL to wrap', type: 'string' }],
        returnType: 'string',
        example: '<a href="%%=RedirectTo(WrapLongURL(@longUrl))=%%">Click here</a>',
    },
];

/**
 * AMPscript keywords for auto-completion.
 */
export const ampscriptKeywords = [
    {
        name: 'var',
        description: 'Declares one or more variables',
        snippet: 'var @${1:variableName}',
    },
    {
        name: 'set',
        description: 'Assigns a value to a variable',
        snippet: 'set @${1:variableName} = ${2:value}',
    },
    {
        name: 'if',
        description: 'Begins a conditional block',
        snippet: 'if ${1:condition} then\n\t${2}\nendif',
    },
    {
        name: 'elseif',
        description: 'Additional condition in an if block',
        snippet: 'elseif ${1:condition} then',
    },
    { name: 'else', description: 'Fallback branch in an if block', snippet: 'else' },
    { name: 'endif', description: 'Closes an if block', snippet: 'endif' },
    {
        name: 'for',
        description: 'Begins a counting loop',
        snippet: 'for @${1:i} = ${2:1} to ${3:rowCount} do\n\t${4}\nnext @${1:i}',
    },
    { name: 'to', description: 'Ascending direction in a for loop', snippet: 'to' },
    { name: 'downto', description: 'Descending direction in a for loop', snippet: 'downto' },
    { name: 'do', description: 'Marks the start of a loop body', snippet: 'do' },
    { name: 'next', description: 'Ends a for loop iteration', snippet: 'next' },
    { name: 'and', description: 'Logical AND operator', snippet: 'and' },
    { name: 'or', description: 'Logical OR operator', snippet: 'or' },
    { name: 'not', description: 'Logical NOT operator', snippet: 'not' },
    { name: 'then', description: 'Follows an if/elseif condition', snippet: 'then' },
    { name: 'true', description: 'Boolean true constant', snippet: 'true' },
    { name: 'false', description: 'Boolean false constant', snippet: 'false' },
];

/**
 * Common system personalization strings.
 */
export const personalizationStrings = [
    // Subscriber identity
    {
        name: '_subscriberKey',
        description: 'Unique key identifying the current subscriber/contact',
    },
    { name: 'emailaddr', description: 'Email address of the current subscriber' },
    {
        name: 'subscriberid',
        description: 'Numeric ID of the subscriber in the All Subscribers list',
    },
    { name: 'firstname', description: 'Subscriber first name attribute' },
    { name: 'lastname', description: 'Subscriber last name attribute' },
    { name: 'fullname', description: 'Subscriber full name attribute' },

    // Email/job metadata
    { name: 'emailname_', description: 'Name of the current email message' },
    { name: '_emailid', description: 'Numeric ID of the current email' },
    { name: 'jobid', description: 'Numeric job identifier of the current send' },
    { name: '_JobSubscriberBatchID', description: 'Batch identifier within the send job' },
    { name: '_PreHeader', description: 'Preheader text for the current email' },
    { name: '_DataSourceName', description: 'Name of the data source used for the send' },

    // Send context
    {
        name: '_messageContext',
        description: 'Render context: "SEND", "PREVIEW", "VAWP", or "FTAF"',
    },
    { name: '_isTestSend', description: 'Boolean indicating whether this is a test send' },
    {
        name: '_messagetypepreference',
        description: 'Subscriber preference for HTML or text-only messages',
    },

    // List information
    { name: 'listid', description: 'Numeric ID of the current send list' },
    { name: '_listname', description: 'Name of the current send list' },
    { name: 'list_', description: 'Name of the list associated with the subscriber' },
    { name: 'listsubid', description: 'Subscriber ID within the specific list' },

    // Email dates (system-generated)
    { name: 'xtmonth', description: 'Full month name of the send date (e.g. "March")' },
    { name: 'xtmonthnumeric', description: 'Numeric month of the send date (1-12)' },
    { name: 'xtday', description: 'Day of month of the send date' },
    { name: 'xtdayofweek', description: 'Day of week of the send date (e.g. "Friday")' },
    { name: 'xtyear', description: 'Four-digit year of the send date' },
    { name: 'xtshortdate', description: 'Short date format of the send date' },
    { name: 'xtlongdate', description: 'Long date format of the send date' },

    // Sender/Business Unit
    { name: 'replyname', description: 'Reply-to display name for the current send' },
    { name: 'replyemailaddress', description: 'Reply-to email address for the current send' },
    { name: 'memberid', description: 'MID (Member ID) of the sending business unit' },
    { name: 'member_busname', description: 'Business name of the sending business unit' },
    { name: 'member_addr', description: 'Street address of the sending business unit' },
    { name: 'member_city', description: 'City of the sending business unit' },
    { name: 'member_state', description: 'State/province of the sending business unit' },
    { name: 'member_postalcode', description: 'Postal code of the sending business unit' },
    { name: 'member_country', description: 'Country of the sending business unit' },

    // Standard URLs
    {
        name: 'view_email_url',
        description: 'URL to view the email in a browser (View as Web Page)',
    },
    { name: 'ftaf_url', description: 'Forward to a Friend URL' },
    { name: 'subscription_center_url', description: 'URL to the subscription center' },
    { name: 'profile_center_url', description: 'URL to the profile center' },
    { name: 'unsub_center_url', description: 'URL to the unsubscribe center' },
    { name: 'double_opt_in_url', description: 'URL for double opt-in confirmation' },

    // Reply Mail Management (RMM)
    {
        name: '_replycontent',
        description: 'Body text of a subscriber reply (Reply Mail Management)',
    },

    // Link tracking
    { name: 'linkname', description: 'Name/alias of the current tracked link' },

    // Impression regions
    { name: '_ImpressionRegionID', description: 'Numeric ID of the current impression region' },
    { name: '_ImpressionRegionName', description: 'Name of the current impression region' },

    // Web/CloudPages context
    { name: 'PAGEURL', description: 'URL of the current CloudPages or microsite page' },

    // MobileConnect (SMS)
    { name: 'MOBILE_NUMBER', description: 'Mobile number of the inbound SMS sender' },
    { name: 'SHORT_CODE', description: 'Short code or long code receiving the SMS' },
    { name: 'MSG(0)', description: 'Full text of the inbound SMS message' },
    { name: 'MSG(0).VERB', description: 'First word (keyword) of the inbound SMS' },
    { name: 'MSG(0).NOUNS', description: 'Everything after the keyword in the inbound SMS' },
    { name: 'MSG(0).NOUN(1)', description: 'Second word of the inbound SMS message' },
    { name: 'MMS_CONTENT_URL(0)', description: 'URL of the first MMS attachment' },

    // MobileConnect contact demographics
    { name: '_CarrierID', description: 'MobileConnect: carrier identifier for the contact' },
    { name: '_Channel', description: 'MobileConnect: messaging channel for the contact' },
    { name: '_City', description: 'MobileConnect: city from contact demographics' },
    { name: '_ContactID', description: 'MobileConnect: contact identifier' },
    { name: '_CountryCode', description: 'MobileConnect: country code from contact demographics' },
    { name: '_CreatedBy', description: 'MobileConnect: user who created the contact record' },
    { name: '_CreatedDate', description: 'MobileConnect: date the contact record was created' },
    { name: '_FirstName', description: 'MobileConnect: contact first name' },
    { name: '_LastName', description: 'MobileConnect: contact last name' },
    { name: '_MobileNumber', description: 'MobileConnect: mobile number of the contact' },
    { name: '_ModifiedBy', description: 'MobileConnect: user who last modified the contact' },
    { name: '_ModifiedDate', description: 'MobileConnect: date the contact was last modified' },
    { name: '_Priority', description: 'MobileConnect: message priority for the contact' },
    { name: '_Source', description: 'MobileConnect: how the contact was added' },
    { name: '_SourceObjectID', description: 'MobileConnect: source object identifier' },
    { name: '_State', description: 'MobileConnect: state from contact demographics' },
    {
        name: '_Status',
        description: 'MobileConnect: subscription status (Active, Unsubscribed, etc.)',
    },
    { name: '_UTCOffset', description: 'MobileConnect: UTC offset for the contact timezone' },
    { name: '_ZipCode', description: 'MobileConnect: ZIP/postal code from contact demographics' },

    // GroupConnect / LINE
    { name: 'LINE_ADDRESS_ID', description: 'GroupConnect: LINE user address identifier' },

    // Execution context
    {
        name: '@@ExecCtx',
        description:
            'Execution context: returns "load" or "post" on web pages (known bug: may always return "load")',
    },
];

/**
 * Build a lookup map for fast case-insensitive function retrieval.
 */
export const functionLookup = new Map<string, AmpscriptFunction>();
for (const function_ of ampscriptFunctions) {
    functionLookup.set(function_.name.toLowerCase(), function_);
}
