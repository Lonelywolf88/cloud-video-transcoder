# API Reference

Complete documentation for all REST API endpoints.

## Base URL

- **Local Development**: `http://localhost:8000/api/v1`
- **Production**: `https://<your-subdomain>.cab432.com/api/v1`

## Authentication

All protected endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Alternatively, pass token as query parameter (not recommended for production):

```
GET /api/v1/videos?token=<token>
```

Tokens are obtained via the `/auth/login` endpoint after user registration and confirmation.

---

## Table of Contents

- [Authentication](#authentication-endpoints)
- [User](#user-endpoints)
- [Videos](#video-endpoints)
- [Media](#media-endpoints)
- [Health](#health-endpoint)

---

## Authentication Endpoints

### Register User

Create a new user account.

**Endpoint**: `POST /api/v1/auth/register`

**Authentication**: None

**Request Body**:
```json
{
  "username": "testuser",
  "password": "SecurePass123!",
  "email": "testuser@example.com"
}
```

**Response** (200 OK):
```json
{
  "message": "Check email for confirmation code"
}
```

**Error Responses**:
- `400 Bad Request`: Missing required fields or invalid password strength
  ```json
  {
    "error": "username, password, email required"
  }
  ```
- `400 Bad Request`: User already exists
  ```json
  {
    "error": "An account with the given email already exists."
  }
  ```

**Notes**:
- Password must meet Cognito requirements (min 8 chars, uppercase, lowercase, number, special char)
- Confirmation code sent to provided email address

---

### Confirm Registration

Confirm user email with code received via email.

**Endpoint**: `POST /api/v1/auth/confirm`

**Authentication**: None

**Request Body**:
```json
{
  "username": "testuser",
  "code": "123456"
}
```

**Response** (200 OK):
```json
{
  "message": "Account confirmed"
}
```

**Error Responses**:
- `400 Bad Request`: Missing required fields
  ```json
  {
    "error": "username and code required"
  }
  ```
- `400 Bad Request`: Invalid code
  ```json
  {
    "error": "Invalid verification code provided, please try again."
  }
  ```

---

### Login

Authenticate user and obtain JWT token.

**Endpoint**: `POST /api/v1/auth/login`

**Authentication**: None

**Request Body**:
```json
{
  "username": "testuser",
  "password": "SecurePass123!"
}
```

**Response** (200 OK):
```json
{
  "token": "eyJraWQiOiJ...long-jwt-string..."
}
```

**Error Responses**:
- `400 Bad Request`: Missing required fields
  ```json
  {
    "error": "username and password required"
  }
  ```
- `401 Unauthorized`: Invalid credentials
  ```json
  {
    "error": "Invalid credentials"
  }
  ```

**Token Details**:
- Type: Cognito IdToken (JWT)
- Expiry: Configurable (default: 1 hour)
- Claims: `sub` (user ID), `cognito:groups` (roles), `email`, etc.

---

## User Endpoints

### Get Current User

Retrieve authenticated user information.

**Endpoint**: `GET /api/v1/me`

**Authentication**: Required

**Response** (200 OK):
```json
{
  "user": {
    "sub": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "cognito:groups": ["Admin"],
    "email": "testuser@example.com",
    "email_verified": true,
    "auth_time": 1729353600,
    "iat": 1729353600,
    "exp": 1729357200
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid token

---

## Video Endpoints

### Request Upload URL (Presigned)

Generate a presigned S3 URL for direct client upload.

**Endpoint**: `POST /api/v1/videos/upload-url`

**Authentication**: Required

**Request Body**:
```json
{
  "contentType": "video/mp4"
}
```

**Response** (201 Created):
```json
{
  "videoId": "d7e8f9a0-1234-5678-90ab-cdef12345678",
  "uploadUrl": "https://bucket.s3.ap-southeast-2.amazonaws.com/user/.../original.mp4?X-Amz-Algorithm=...",
  "expiresIn": 3600,
  "method": "PUT",
  "originalKey": "user/<userId>/videos/<videoId>/original.mp4"
}
```

**Usage**:
1. Client receives `uploadUrl`
2. Client performs `PUT` request to `uploadUrl` with video file
3. Client calls `/videos/:id/complete` to finalize

**Error Responses**:
- `401 Unauthorized`: Missing or invalid token
- `500 Internal Server Error`: S3 error

---

### Complete Upload

Mark presigned upload as complete and queue for transcoding.

**Endpoint**: `POST /api/v1/videos/:id/complete`

**Authentication**: Required

**Path Parameters**:
- `id` (string): Video ID from upload URL request

**Request Body**:
```json
{
  "title": "My Amazing Video",
  "duration": 120
}
```

**Response** (201 Created):
```json
{
  "video": {
    "id": "d7e8f9a0-1234-5678-90ab-cdef12345678",
    "userId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "title": "My Amazing Video",
    "status": "queued",
    "duration": 120,
    "originalKey": "user/.../original.mp4",
    "thumbnailKey": null,
    "renditions": [],
    "tags": [],
    "errorMessage": null,
    "sourceType": "upload",
    "sourceUrl": null,
    "createdAt": "2025-10-19T12:00:00.000Z",
    "updatedAt": "2025-10-19T12:00:00.000Z"
  }
}
```

**Error Responses**:
- `404 Not Found`: Uploaded object not found in S3
- `409 Conflict`: Video already exists
- `500 Internal Server Error`: Database error

---

### Upload Video (Multipart)

Upload video file directly to API server (alternative to presigned URL).

**Endpoint**: `POST /api/v1/videos`

**Authentication**: Required

**Content-Type**: `multipart/form-data`

**Form Fields**:
- `file` (file, required): Video file (MP4 only)
- `title` (string, optional): Video title (defaults to filename)
- `duration` (number, optional): Video duration in seconds

**Response** (201 Created):
```json
{
  "video": {
    "id": "d7e8f9a0-1234-5678-90ab-cdef12345678",
    "userId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "title": "sample.mp4",
    "status": "queued",
    "duration": null,
    "originalKey": "user/.../original.mp4",
    "thumbnailKey": null,
    "renditions": [],
    "tags": [],
    "errorMessage": null,
    "sourceType": "upload",
    "sourceUrl": null,
    "createdAt": "2025-10-19T12:00:00.000Z",
    "updatedAt": "2025-10-19T12:00:00.000Z"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Missing file or invalid MIME type
  ```json
  {
    "error": "Only video/mp4 uploads are supported"
  }
  ```
- `500 Internal Server Error`: Upload failed

**Notes**:
- Max file size: 10 MB (configurable via `REQUEST_BODY_LIMIT`)
- For larger files, use presigned URL method

---

### List Videos

Retrieve paginated list of videos with optional filtering.

**Endpoint**: `GET /api/v1/videos`

**Authentication**: Required

**Query Parameters**:
- `page` (number, optional): Page number (default: 1)
- `pageSize` (number, optional): Items per page (default: 10, max: 100)
- `per_page` (number, optional): Alias for `pageSize`
- `status` (string, optional): Filter by status (`queued`, `processing`, `completed`, `failed`)
- `q` (string, optional): Search by title (case-insensitive substring match)
- `tag` (string, optional): Filter by tag (exact match)

**Response** (200 OK):
```json
{
  "page": 1,
  "pageSize": 10,
  "total": 42,
  "items": [
    {
      "id": "d7e8f9a0-1234-5678-90ab-cdef12345678",
      "userId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
      "title": "My Amazing Video",
      "status": "completed",
      "duration": 120,
      "originalKey": "user/.../original.mp4",
      "thumbnailKey": "user/.../thumbnail.jpg",
      "renditions": [
        {
          "resolution": "1080",
          "s3Key": "user/.../renditions/1080.mp4",
          "sizeBytes": 12345678
        },
        {
          "resolution": "720",
          "s3Key": "user/.../renditions/720.mp4",
          "sizeBytes": 8901234
        },
        {
          "resolution": "480",
          "s3Key": "user/.../renditions/480.mp4",
          "sizeBytes": 5678901
        }
      ],
      "tags": ["nature", "landscape", "sunset"],
      "errorMessage": null,
      "sourceType": "upload",
      "sourceUrl": null,
      "createdAt": "2025-10-19T12:00:00.000Z",
      "updatedAt": "2025-10-19T12:05:00.000Z"
    }
  ]
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid token
- `500 Internal Server Error`: Database error

**Notes**:
- Regular users see only their own videos
- Admin users (with `Admin` group) see all videos
- Results are cached (90s TTL) for performance
- Cache is invalidated on mutations (upload, complete, delete)

---

### Get Single Video

Retrieve details for a specific video.

**Endpoint**: `GET /api/v1/videos/:id`

**Authentication**: Required

**Path Parameters**:
- `id` (string): Video ID

**Request Headers** (optional):
- `If-None-Match` (string): ETag from previous response

**Response** (200 OK):
```json
{
  "id": "d7e8f9a0-1234-5678-90ab-cdef12345678",
  "userId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "title": "My Amazing Video",
  "status": "completed",
  "duration": 120,
  "originalKey": "user/.../original.mp4",
  "thumbnailKey": "user/.../thumbnail.jpg",
  "renditions": [
    {
      "resolution": "1080",
      "s3Key": "user/.../renditions/1080.mp4",
      "sizeBytes": 12345678
    }
  ],
  "tags": ["nature", "landscape"],
  "errorMessage": null,
  "sourceType": "upload",
  "sourceUrl": null,
  "createdAt": "2025-10-19T12:00:00.000Z",
  "updatedAt": "2025-10-19T12:05:00.000Z"
}
```

**Response Headers**:
- `ETag`: Weak ETag based on content hash (e.g., `W/"vid-<id>-<hash>"`)

**Response** (304 Not Modified):
- Returned if `If-None-Match` matches current `ETag`
- No body

**Error Responses**:
- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Video does not exist or user does not own it
  ```json
  {
    "error": "Not found"
  }
  ```

**Notes**:
- Supports ETag caching for efficient polling
- Admin users can view any video

---

### Cancel Transcode

Cancel in-progress video transcoding.

**Endpoint**: `POST /api/v1/videos/:id/cancel`

**Authentication**: Required

**Path Parameters**:
- `id` (string): Video ID

**Response** (200 OK):
```json
{
  "canceled": true,
  "status": "failed"
}
```

**Alternative Response** (if currently processing):
```json
{
  "canceling": true,
  "status": "processing"
}
```

**Error Responses**:
- `404 Not Found`: Video does not exist
- `400 Bad Request`: Cannot cancel (not in `queued` or `processing` status)
  ```json
  {
    "error": "Cannot cancel in status completed"
  }
  ```
- `409 Conflict`: Worker is not currently processing this video
  ```json
  {
    "error": "Worker is not on this video right now"
  }
  ```

**Notes**:
- Queued videos are immediately marked as `failed`
- Processing videos are aborted via `AbortController` signal (FFmpeg kills gracefully)

---

### Delete Video (Admin Only)

Permanently delete a video and all associated files.

**Endpoint**: `DELETE /api/v1/videos/:id`

**Authentication**: Required (Admin group)

**Path Parameters**:
- `id` (string): Video ID

**Response** (204 No Content):
- Empty body

**Error Responses**:
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not in Admin group
  ```json
  {
    "error": "Only Admins are allowed to delete this video"
  }
  ```
- `404 Not Found`: Video does not exist
- `500 Internal Server Error`: Deletion failed

**Notes**:
- Deletes all S3 objects: original, renditions, thumbnail
- Removes DynamoDB record
- If video is processing, transcode is canceled first
- Admin can delete any user's video

---

## Media Endpoints

### Stream Video

Get presigned S3 URL for video streaming.

**Endpoint**: `GET /api/v1/videos/:id/stream`

**Authentication**: Required

**Path Parameters**:
- `id` (string): Video ID

**Query Parameters**:
- `res` (string, optional): Resolution (`original`, `1080`, `720`, `480`, default: `original`)

**Response** (200 OK):
```json
{
  "url": "https://bucket.s3.ap-southeast-2.amazonaws.com/user/.../renditions/720.mp4?X-Amz-Algorithm=...",
  "expiresIn": 3600
}
```

**Error Responses**:
- `404 Not Found`: Video or rendition does not exist
  ```json
  {
    "error": "Rendition not found"
  }
  ```
- `500 Internal Server Error`: S3 error

**Usage**:
1. Client calls this endpoint
2. Client receives presigned S3 GET URL
3. Client uses URL in `<video>` tag or player
4. URL valid for 60 minutes

---

### Download Video

Get presigned S3 URL for video download with attachment disposition.

**Endpoint**: `GET /api/v1/videos/:id/download`

**Authentication**: Required

**Path Parameters**:
- `id` (string): Video ID

**Query Parameters**:
- `res` (string, optional): Resolution (`original`, `1080`, `720`, `480`, default: `original`)

**Response** (200 OK):
```json
{
  "url": "https://bucket.s3.ap-southeast-2.amazonaws.com/user/.../renditions/720.mp4?X-Amz-Algorithm=...&response-content-disposition=attachment...",
  "expiresIn": 3600,
  "filename": "My_Amazing_Video_720.mp4"
}
```

**Error Responses**:
- Same as `/stream` endpoint

**Notes**:
- URL includes `Content-Disposition: attachment` header
- Browser will prompt "Save As" dialog instead of playing inline

---

### Get Thumbnail

Get presigned S3 URL for video thumbnail.

**Endpoint**: `GET /api/v1/videos/:id/thumb`

**Authentication**: Required

**Path Parameters**:
- `id` (string): Video ID

**Response** (200 OK):
```json
{
  "url": "https://bucket.s3.ap-southeast-2.amazonaws.com/user/.../thumbnail.jpg?X-Amz-Algorithm=...",
  "expiresIn": 3600
}
```

**Alternative Response** (if no thumbnail, returns fallback SVG):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="160" height="90">
  <rect width="160" height="90" fill="#0f172a"/>
  <text x="20" y="50" font-family="Arial" font-size="14" fill="#e2e8f0">No thumbnail</text>
</svg>
```

**Response Headers** (fallback):
- `Content-Type: image/svg+xml`
- `Cache-Control: no-cache`

**Notes**:
- Thumbnail generated at 3s mark during transcoding
- Fallback SVG used for videos in `queued` or `processing` status

---

## Health Endpoint

### Health Check

Check if API server is running.

**Endpoint**: `GET /api/v1/health`

**Authentication**: None

**Response** (200 OK):
```json
{
  "ok": true
}
```

**Usage**:
- Used by load balancers, Docker healthchecks, monitoring systems
- Always returns 200 if server is responsive

---

## Error Codes

| Status Code | Meaning |
|-------------|---------|
| `200 OK` | Request succeeded |
| `201 Created` | Resource created successfully |
| `204 No Content` | Request succeeded, no response body |
| `304 Not Modified` | Resource unchanged (ETag match) |
| `400 Bad Request` | Invalid request (missing/invalid parameters) |
| `401 Unauthorized` | Missing or invalid authentication token |
| `403 Forbidden` | Insufficient permissions (e.g., not Admin) |
| `404 Not Found` | Resource does not exist |
| `409 Conflict` | Resource already exists or state conflict |
| `500 Internal Server Error` | Server error (logged for debugging) |

---

## Rate Limiting

**Current**: None (not implemented in Assessment 2)

**Future (Assessment 3)**:
- API Gateway or Express middleware rate limiting
- Limit: 100 requests/minute per user

---

## CORS

**Allowed Origins**: Configurable via `CORS_ORIGIN` environment variable

**Default**: `*` (allow all origins)

**Production**: Set to specific domain (e.g., `https://g57.cab432.com`)

**Allowed Methods**: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`

**Allowed Headers**: `Authorization`, `Content-Type`

---

## Versioning

**Current Version**: `v1`

**Base Path**: `/api/v1`

**Future Versions**: `/api/v2`, etc. (backwards compatibility via separate routes)

---

## Changelog

### v1 (2025-10-19)
- Initial release
- Authentication (Cognito)
- Video upload (presigned URL, multipart)
- Video list with caching
- Transcode to 3 resolutions
- Thumbnail generation
- Auto-tagging via Hugging Face
- Admin-only delete

---

## Examples

### Complete Upload Flow (cURL)

```bash
# 1. Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"Demo1234!","email":"demo@example.com"}'

# 2. Confirm (check email for code)
curl -X POST http://localhost:8000/api/v1/auth/confirm \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","code":"123456"}'

# 3. Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"Demo1234!"}' \
  | jq -r .token)

# 4. Request upload URL
UPLOAD=$(curl -s -X POST http://localhost:8000/api/v1/videos/upload-url \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contentType":"video/mp4"}')

VIDEO_ID=$(echo $UPLOAD | jq -r .videoId)
UPLOAD_URL=$(echo $UPLOAD | jq -r .uploadUrl)

# 5. Upload file to S3
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: video/mp4" \
  --upload-file sample.mp4

# 6. Complete upload
curl -X POST http://localhost:8000/api/v1/videos/$VIDEO_ID/complete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"My Demo Video","duration":60}'

# 7. Poll for completion
watch -n 5 "curl -s http://localhost:8000/api/v1/videos/$VIDEO_ID \
  -H 'Authorization: Bearer $TOKEN' | jq .status"

# 8. Stream when complete
curl -s http://localhost:8000/api/v1/videos/$VIDEO_ID/stream?res=720 \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r .url
```

### JavaScript (Fetch API)

```javascript
// Login
const loginRes = await fetch('http://localhost:8000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'demo', password: 'Demo1234!' })
});
const { token } = await loginRes.json();

// List videos
const listRes = await fetch('http://localhost:8000/api/v1/videos?page=1&pageSize=10', {
  headers: { Authorization: `Bearer ${token}` }
});
const { items } = await listRes.json();

// Get single video
const videoRes = await fetch(`http://localhost:8000/api/v1/videos/${items[0].id}`, {
  headers: { Authorization: `Bearer ${token}` }
});
const video = await videoRes.json();

// Get stream URL
const streamRes = await fetch(`http://localhost:8000/api/v1/videos/${video.id}/stream?res=720`, {
  headers: { Authorization: `Bearer ${token}` }
});
const { url } = await streamRes.json();

// Play in video element
document.querySelector('video').src = url;
```

---

## Support

For issues or questions:
1. Check [README.md](./README.md) for setup instructions
2. Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
3. Contact teaching team for assignment-specific queries

---

**Last Updated**: October 19, 2025
