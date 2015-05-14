# bucketCloner
Copy your S3 buckets crazy fast!

This tool will copy all objects from one bucket to another using many sockets
simultaneously.  It **does not** empty the target bucket first.  You will need
to do that yourself if necessary.

## Installation / Setup
bucketCloner requires Node.js.  It has been tested on v0.12.x.

1. `npm install -g bucket-cloner`
1. Configure your AWS credentials on your system.  http://aws.amazon.com/sdk-for-node-js/

## Usage

### Quick Example
```
bucketcloner --source="mybucket" --target="myotherbucket"
```

### Options

#### --source
Specifies the name of the bucket to copy **from**.

#### --target
Specifies the name of the bucket to copy **to**.

#### --maxSockets
bucketCloner creates a number of socket connections to S3 simultaneously so
that it can copy many objects at the same time.  Each connection is also
re-used for many copy requests.  This parameter sets the number of concurrent
connections to make.

Several hundred is a good value to choose when you have a nice solid connection
to S3 (such as on an EC2 instance).  For example:

```
--maxSockets=400
```

Default: 100

#### --maxRequests
A queue of requests is maintained at all times, ready to be flushed to sockets
as they become available.  It is good to tune this value to some small multiple
of the maximum number of sockets, such as 4x.

```
--maxRequests=1600
```

Default: 500

#### --acl
The original object's ACL is not copied over from the source bucket.  You must
choose what ACL to apply to objects in the target bucket. Possible choices:

 - `private`
 - `public-read`
 - `public-read-write`
 - `authenticated-read`
 - `bucket-owner-read`
 - `bucket-owner-full-control`
 
```
--acl="public-read"
```

Default: public-read

#### --storageClass
The original object's storage class is copied from the source bucket by
default, but you can choose to override it here.  Possible choices:

 - `STANDARD`
 - `REDUCED_RUNDANCY`
 
```
--storageClass=REDUCED_REDUNDANCY
```

Default: The storage class from the original object in the source bucket.

#### --sslEnabled
You can choose to enable TLS/SSL connections.  There is some overhead with
this option, and it is disabled by default.  Note that if you do not use SSL,
your AWS secret is not exposed.  It is used to sign requests sent to S3, but
is not sent in the clear itself.  Paths and parameters **are** sent in the
clear however, so decide for your use case whether or not this option is
relevant.

```
--sslEnabled
```

Default: false

#### --keyMatch
Sometimes you only want to copy certain objects.  If specified, only keys
matching the regex in keyMatch will be copied.  Others will be ignored.

```
--keyMatch="raw\.jpg$"
```

#### --marker
If a bucket clone is stopped in the middle, you can use this option to resume
where you left off.  The `marker` is the key of the last object copied, and is
output every second in the status information block.

S3 objects are copied alphabetically.  You can also use `marker` to start the
copying from an arbitrary key in the bucket.

```
--marker="/i/012345678/raw.jpg"
```

Default:  None.  Bucket copying starts from beginning by default.
