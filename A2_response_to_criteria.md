Assignment 2 - Cloud Services Exercises - Response to Criteria
================================================

Instructions
------------------------------------------------
- Keep this file named A2_response_to_criteria.md, do not change the name
- Upload this file along with your code in the root directory of your project
- Upload this file in the current Markdown format (.md extension)
- Do not delete or rearrange sections.  If you did not attempt a criterion, leave it blank
- Text inside [ ] like [eg. S3 ] are examples and should be removed


Overview
------------------------------------------------

- **Name:** Yi Teng Teoh
- **Student number:** n12138657
- **Partner name (if applicable):** Sin Boon Leon
- **Student number:** n12126179
- **Application name:** VideoTranscoder
- **Two line description:** A video transcoding web application that allows users to upload MP4 files, which are automatically processed into multiple renditions and thumbnails. 
- **EC2 instance name or ID:** g57-assessment2 / i-03f83524701aa6878

------------------------------------------------

### Core - First data persistence service

- **AWS service name:**  S3
- **What data is being stored?:** Raw uploaded video files,transcoded renditions (1080p, 720p, 480p) and thumbnail.
- **Why is this service suited to this data?:** S3 is optimized for storing large, unstructured binary objects. It provides durability, scalability, and direct integration with video transcoding and CDN delivery.
- **Why is are the other services used not suitable for this data?:** DynamoDB is designed for structured metadata, not for storing multi-MB or GB video files.
- **Bucket/instance/table name:** g57-assignment2
- **Video timestamp:**
- **Relevant files:**
    -src/worker/transcodeWorker.js
    -src/lib/paths.js
    -src/routes/videos.js

### Core - Second data persistence service

- **AWS service name:**  DynamoDB
- **What data is being stored?:** Metadata for each video, including title, user ID, status (queued/processing/completed), S3 keys for renditions and thumbnails, tags, and duration.
- **Why is this service suited to this data?:** DynamoDB provides fast key-value and document storage with low latency, which is ideal for video metadata lookups (listing videos, filtering by tags, checking status). The flexible schema makes it easy to store evolving video attributes.
- **Why is are the other services used not suitable for this data?:** S3 is optimized for storing large binary objects, but inefficient for querying or filtering structured metadata.
- **Bucket/instance/table name:**
g57-assessment2-app-main
- **Video timestamp:**
- **Relevant files:**
    -src/routes/media.js
    -src/lib/paths.js

### Third data service

- **AWS service name:**  [eg. RDS]
- **What data is being stored?:** [eg video metadata]
- **Why is this service suited to this data?:** [eg. ]
- **Why is are the other services used not suitable for this data?:** [eg. Advanced video search requires complex querries which are not available on S3 and inefficient on DynamoDB]
- **Bucket/instance/table name:**
- **Video timestamp:**
- **Relevant files:**
    -

### S3 Pre-signed URLs

- **S3 Bucket names:** g57-assignment2
- **Video timestamp:**
- **Relevant files:**
    -src/routes/video.js
    -src/routes/media.js
    -src/lib/s3Presign.js
    -public/index.js
    -src/cors.json

### In-memory cache
- **ElastiCache instance name:** g57-memcache
- **What data is being cached?:** Thumbnails from uploaded videos (small JPEG images retrieved from S3) and video metadata (JSON objects containing title, status, tags, renditions, etc.).
- **Why is this data likely to be accessed frequently?:** Thumbnails are displayed every time users browse the video list, so they are repeatedly requested.Metadata is queried whenever a user opens the dashboard, refreshes the list, or filters videos.
- **Video timestamp:**
- **Relevant files:**
    -src/lib/cache.js (Memcached connection and helpers like cacheGetJSON, cacheSetJSON, cacheGetBuffer, cacheSetBuffer)
    -src/routes/videos.js
    -src/index.js

### Core - Statelessness

- **What data is stored within your application that is not stored in cloud data services?:** Only temporary files created by the transcode worker (e.g. original downloads from S3, intermediate renditions during ffmpeg processing, and a thumbnail image before upload).
- **Why is this data not considered persistent state?:** These files are ephemeral — they exist only in the container’s /tmp directory while processing is in progress. After successful transcoding, all renditions and thumbnails are uploaded to S3 and metadata is written to DynamoDB. The temporary files are then deleted. If the container crashes, they can be recreated from the original video in S3.
- **How does your application ensure data consistency if the app suddenly stops?:** The worker uses DynamoDB to track job state. On startup and at intervals, it checks for “stale” jobs (locked too long) and re-queues them. This ensures that if a container crashes mid-process, another worker can pick up the job and re-process it safely. Because all durable state (video objects and thumbnails in S3, metadata in DynamoDB) is already stored in cloud services, no video data is lost. Playback and downloads use presigned S3 URLs, so the application never persists or proxies video content; clients fetch directly from S3.
- **Relevant files:**
    -src/worker/transcodeWorker.js
    -src/lib/paths.js + src/routes/videos.js + src/routes/media.js (manage presigned S3 URLs, never store video bytes in app)

### Graceful handling of persistent connections

- **Type of persistent connection and use:** [eg. server-side-events for progress reporting]
- **Method for handling lost connections:** [eg. client responds to lost connection by reconnecting and indicating loss of connection to user until connection is re-established ]
- **Relevant files:**
    -


### Core - Authentication with Cognito

- **User pool name:** A2-group57
- **How are authentication tokens handled by the client?:** 
The client stores the Cognito ID token (JWT) and refresh token in localStorage. For API requests, the ID token is included in the Authorization header. When the ID token expires, the refresh token is used to get a new one.
- **Relevant files:**
    -public/login.js
    -src/middleware/auth.js

### Cognito multi-factor authentication

- **What factors are used for authentication:** Password (username + password) and TOTP code from an authenticator app (software token MFA).
- **Video timestamp:**
- **Relevant files:**
    -public/login.js
    -src/middleware/auth.js

### Cognito federated identities

- **Identity providers used:**
- **Video timestamp:**
- **Relevant files:**
    -

### Cognito groups

- **How are groups used to set permissions?:** only admin users can delete other users
- **Video timestamp:**
- **Relevant files:**
    -public/login.js
    -src/middleware/auth.js
    -src/index.js

### Core - DNS with Route53

- **Subdomain**:  g57.cab432.com
- **Video timestamp:**

### Parameter store

- **Parameter names:** /cab432/g57/app/{parameter_name}
- **Video timestamp:**
- **Relevant files:**
    -src/config/parameterStore.js
    -src/index.js

### Secrets manager

- **Secrets names:** group57/A2/secret
- **Video timestamp:**
- **Relevant files:**
    -src/config/secretManager.js
    -src/index.js

### Infrastructure as code

- **Technology used:** Terraform
- **Services deployed:** (S3 bucket, DynamoDB table, Cognito user pool, Cognito user pool client)
- **Video timestamp:**
- **Relevant files:**
    -terrform/main.tf
    -terrform/output.tf
    -terrform/version.tf

### Other (with prior approval only)

- **Description:**
- **Video timestamp:**
- **Relevant files:**
    -

### Other (with prior permission only)

- **Description:**
- **Video timestamp:**
- **Relevant files:**
    -
