#! /usr/bin/env node

var AWS = require('aws-sdk');
var fs = require('fs');
var http = require('http');
var LineStream = require('byline').LineStream;
var yargs = require('yargs');

var s3;
var listFile;
var objectsToCopy = [];
var maxRequests;
var currentRequests = 0;

var nextMarker = null;
var listInProgress = false;

var progress = {
  succeeded: 0,
  failed: 0,
  bytesTransferred: 0
}

function outputStatus() {
  var uptime = process.uptime();
  console.log({
    uptime: uptime,
    listBufferSize: objectsToCopy.length,
    succeeded: progress.succeeded,
    failed: progress.failed,
    gigabytesTransferred: progress.bytesTransferred/1024/1024/1024,
    megabitsPerSecond: ((progress.bytesTransferred/1024/1024) * 8) / uptime,
    objectsPerSecond: progress.succeeded / uptime,
    marker: nextMarker
  });
}

function checkKeyMatch(object) {
  if (!argv.keymatch) {
    return object;
  } else {
    if (object.Key.match(argv.keyMatch)) {
      return object;
    } else {
      return false;
    }
  }
}

function getNextListChunk() {
  // Read list of objects to copy from source bucket
  listInProgress = true;
  
  s3.listObjects({
    Bucket: argv.source,
    Marker: nextMarker
  }, function (err, data) {
    if (err) {
      console.log('Fatal error while listing objects', err);
      process.exit(1);
    }
    
    if (data) {
      data.Contents.forEach(function (object) {
        if (checkKeyMatch(object)) {
          objectsToCopy.push(object);
        }
      });

      if (data.IsTruncated) {
        nextMarker = data.Contents[data.Contents.length-1].Key;
      } else {
        nextMarker = false;
      }  
    }
    listInProgress = false;
    startRequests();
  });
  
}

function startRequests() {
  if (listFile) {
    // Use a file list of keys to copy
    if (objectsToCopy.length >= argv.maxListBufferSize) {
      listFile.pause();
    } else {
      listFile.resume();
    }
    
  } else {
    // Get directory listing from S3
    if (!listInProgress && objectsToCopy.length < argv.maxListBufferSize && nextMarker !== false) {
      getNextListChunk();
    }
    
  }

  while (currentRequests <= maxRequests && objectsToCopy.length) {
    currentRequests++;
    var objectToCopy = objectsToCopy.pop();

    s3.copyObject({
      Bucket: argv.target,
      CopySource: encodeURIComponent(argv.source) + '/' + objectToCopy.Key,
      Key: objectToCopy.Key,
      ACL: argv.acl,
      MetadataDirective: 'COPY',
      StorageClass: argv.storageClass || objectToCopy.StorageClass
    }, function (err, data) {
      if (err) {
        if (!argv.noErrorOutput) {
          console.log('Error with ' + objectToCopy.Key, err);
        }
        progress.failed++;
      } else {
        progress.succeeded++;
        progress.bytesTransferred += objectToCopy.Size
      }
      
      currentRequests--;
      setImmediate(startRequests);

    });
  }
}

var argv = yargs
  .usage('Usage: $0 --source=[source bucket name] --target=[target bucket name]')
  .demand(['source','target'])

  .describe('source', 'The bucket to copy FROM')

  .describe('target', 'The bucket to copy TO')

  .describe('maxSockets', 'Concurrent connection limit for S3 connection')
  .default('maxSockets', 100)

  .describe('maxRequests', 'Concurrent copy operations (Set to a number greater than maxSockets for best performance.)')
  .default('maxRequests', 500)

  .describe('acl', 'The canned ACL to apply to copied objects (private | public-read | public-read-write | authenticated-read | bucket-owner-read | bucket-owner-full-control)')
  .default('acl', 'private')

  .describe('storageClass', 'Override the original storage class with this (STANDARD | REDUCED_REDUNDANCY)')
  .default('storageClass', null, 'original object storageClass')
  
  .boolean('sslEnabled')
  .describe('sslEnabled', 'Enable TLS/SSL wrapping for S3 connections')
  .default('sslEnabled', false)
  
  .describe('listFile', 'Read a list of keys to copy from a file rather than the contents of the source bucket')
  
  .describe('maxListBufferSize', 'The number of objects keep in the copy queue before reading from the source list again')
  .default('maxListBufferSize', 10000)

  .describe('keyMatch', 'RegEx to match the keys of objects that will be copied')

  .describe('marker', 'Object key to start LIST operations after (to resume an interrupted bucket copy)')
  
  .boolean('noErrorOutput')
  .describe('noErrorOutput', 'Disable error message output to STDOUT')
  .default('noErrorOutput', false)

  .help('h')
  .alias('h', 'help')
  .example('$0 --source=mybucket --target=myotherbucket --maxSockets=400 --maxRequests=1600 --acl="public-read" --storageClass="REDUCED_REDUNDANCY" --keyMatch="raw\.jpg$"', 'Copies from mybucket to myotherbucket, many objects at a time, while forcing public access, reduced redundancy, and filtering on object keys ending in raw.jpg.')
  .argv;

console.log('Arguments', argv);

maxRequests = argv.maxRequests;
http.globalAgent.maxSockets = argv.maxSockets;
nextMarker = argv.marker || null;

AWS.config.sslEnabled = argv.sslEnabled;
var s3 = new AWS.S3({signatureVersion: 'v4'});

if (argv.listFile) {
  listFile = new LineStream();
  
  if (argv.listFile === '-') {
    process.stdin.pipe(listFile);
  } else {
    fs.createReadStream(argv.listFile, {flags: 'r'}).pipe(listFile);
  }
  
  // Read list of objects to copy from a file
  listFile.on('data', function (line) {
    var newObject = {
      Key: line.toString(),
      StorageClass: 'STANDARD',
      Size: 0
    };
    if (checkKeyMatch(newObject)) {
      objectsToCopy.push(newObject);
    }
    startRequests();
  });
}

startRequests();

setInterval(outputStatus, 1000).unref();
process.on('exit', outputStatus);
