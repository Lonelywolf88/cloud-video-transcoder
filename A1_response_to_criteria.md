Assignment 1 - REST API Project - Response to Criteria
================================================

Overview
------------------------------------------------

- **Name:** Yi Teng Teoh
- **Student number:** n12138657
- **Application name:** VideoTranscoder
- **Two line description:**A video transcoding web application that allows users to upload MP4 files, which are automatically processed into multiple renditions and thumbnails. The system also auto-tags videos, stores metadata in a database, and provides access through a secure REST API.


Core criteria
------------------------------------------------

### Containerise the app

- **ECR Repository name:**12138657-assignment1
- **Video timestamp:**0.31
- **Relevant files:**
    - /Dockerfile
    -/.dockerignore

### Deploy the container

- **EC2 instance ID:**i-03f83524701aa6878
- **Video timestamp:**0.53

### User login

- **One line description:**Users register and log in with JWT authentication so that each user only manages their own videos.
- **Video timestamp:**2.39
- **Relevant files:**
    -/src/middleware/auth.js

### REST API

- **One line description:**The primary interface is a REST API that supports uploading, listing, filtering, streaming, and deleting videos with JSON responses.
- **Video timestamp:**2.53
- **Relevant files:**
    -/src/routes/auth.js
    -/src/routes/media.js
    -/src/routes/videos.js

### Data types

- **One line description:**The application stores multiple kinds of data beyond login details, including video metadata, renditions, and auto-generated tags.
- **Video timestamp:**0.00
- **Relevant files:**
    -/data/app.db

#### First kind

- **One line description:**Video metadata such as title, status, duration, and thumbnail path.
- **Type:**Structured text and numeric fields.
- **Rationale:**Needed to describe and manage each uploaded video in the system.
- **Video timestamp:**0.06
- **Relevant files:**
    -/data/app.db

#### Second kind

- **One line description:**The application stores transcoded video renditions, including resolution, file path, file size, and creation timestamp.
- **Type:**Numeric (file size), text (resolution, path), and datetime (created_at).
- **Rationale:**Each uploaded video is transcoded into multiple quality levels (1080p, 720p, 480p), and storing this data allows the system to stream or download the correct version.
- **Video timestamp:**0.16
- **Relevant files:**
  -/data/app.db

### CPU intensive task

 **One line description:**ffmpeg is used to transcode each uploaded video into multiple renditions, which is a CPU-intensive process.
- **Video timestamp:**4.30
- **Relevant files:**
    -/src/lib/ffmpeg.js

### CPU load testing

 **One line description:**A client repeatedly uploads videos to sustain CPU usage above 80% for several minutes.
- **Video timestamp:**2.17
- **Relevant files:**
    -

Additional criteria
------------------------------------------------

### Extensive REST API features

- **One line description:** The REST API supports extended functionality including filtering videos by tag, searching by title, pagination, and canceling queued jobs.
- **Video timestamp:**3.14
- **Relevant files:**
    -/src/routes/videos.js

### External API(s)

- **One line description:** The application integrates with Hugging Face’s ResNet-50 image classification model to automatically generate tags from video thumbnails.
- **Video timestamp:**3.46
- **Relevant files:**
    -/src/lib/tagger.js

### Additional types of data

- **One line description:** Not attempted
- **Video timestamp:**
- **Relevant files:**
    -

### Custom processing

- **One line description:** Not attempted
- **Video timestamp:**
- **Relevant files:**
    - 

### Infrastructure as code

- **One line description:** Not attempted
- **Video timestamp:**
- **Relevant files:**
    - 

### Web client

- **One line description:**A simple web interface built with vanilla JavaScript and Tailwind that lets users log in, upload videos, and manage their video library through the API.
- **Video timestamp:**2.07
- **Relevant files:**
    -/public/index.html
    -/public/index.js
    -/public/login.html
    -/public/login.js
    -/public/style.css

### Upon request

- **One line description:** Not attempted
- **Video timestamp:**
- **Relevant files:**
    - 
